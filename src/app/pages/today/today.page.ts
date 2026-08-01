import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import {
  IonContent, IonRefresher, IonRefresherContent,
  IonItem, IonLabel, IonList, IonNote,
  IonButton, IonButtons,
} from '@ionic/angular/standalone';

import { Knot } from '../../models/knot.model';
import { Chain } from '../../models/chain.model';
import { StoreService } from '../../services/store.service';
import { RulesService } from '../../services/rules.service';
import { ContextService } from '../../services/context.service';
import { GoalService } from '../../services/goal.service';
import { ChainService } from '../../services/chain.service';
import { KnotCardComponent } from '../../components/knot-card/knot-card.component';
import { ChainViewComponent } from '../../components/chain-view/chain-view.component';

type BacklogSort = 'friction' | 'impact' | 'recent';

// Mapa de status → id del elemento en el HTML
const SECTION_IDS: Record<string, string> = {
  DOING:      'section-doing',
  UNLOCKABLE: 'section-unlockable',
  DONE:       'section-done',
  SOMEDAY:    'section-backlog',
  BLOCKED:    'section-backlog',
};

@Component({
  selector: 'app-today',
  templateUrl: './today.page.html',
  styleUrls: ['./today.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonRefresher, IonRefresherContent,
    IonItem, IonLabel, IonList, IonNote,
    IonButton, IonButtons,
    KnotCardComponent,
    ChainViewComponent,
  ],
})
export class TodayPage implements OnInit, OnDestroy {
  @ViewChild(IonContent, { static: false }) ionContent!: IonContent;

  viewMode: 'list' | 'chain' = 'list';
  chains: Chain[] = [];
  unchainedKnots: Knot[] = [];

  doingKnot: Knot | null = null;
  unlockables: Knot[] = [];
  doneKnots: Knot[] = [];
  backlog: Knot[] = [];

  backlogSort: BacklogSort = 'friction';
  backlogDir: 'asc' | 'desc' = 'asc';
  quickEditHidden = false;

  doneGroups: { key: string; label: string; items: Knot[] }[] = [];
  marqueeText = '';
  goalMet = false;

  doneOpen = true;
  backlogOpen = true;

  // Backlog separado por tipo
  get somedayKnots(): Knot[] { return this.backlog.filter(k => k.status === 'SOMEDAY'); }
  get blockedKnots(): Knot[] { return this.backlog.filter(k => k.status === 'BLOCKED'); }

  private sub!: Subscription;
  private filterSub!: Subscription;
  private chainSub!: Subscription;

  constructor(
    private store: StoreService,
    private rules: RulesService,
    private ctx: ContextService,
    private goal: GoalService,
    private chainService: ChainService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.ctx.migrateKnotContextsOnce();
    this.loadQuickEditPref();
    this.loadViewModePref();
    this.sub = this.store.knots$.subscribe(() => this.render());
    this.filterSub = this.ctx.filter$.subscribe(() => this.render());
    this.chainSub = this.chainService.chains$.subscribe((chains: Chain[]) => {
      this.chains = [...chains]
        .filter(c => this.chainService.getChainSize(c.id) > 0)
        .sort((a, b) => b.createdAt - a.createdAt);
    });
    this.render();

    // Scroll a sección si viene de Análisis
    this.route.queryParams.subscribe(params => {
      const scrollTo = params['scrollTo'];
      if (scrollTo) {
        // Abre el details si corresponde
        if (['SOMEDAY', 'BLOCKED'].includes(scrollTo)) this.backlogOpen = true;
        if (scrollTo === 'DONE') this.doneOpen = true;

        // Espera que el DOM se actualice
        setTimeout(() => this.scrollToSection(scrollTo), 350);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.filterSub?.unsubscribe();
    this.chainSub?.unsubscribe();
  }

  scrollToSection(status: string): void {
    const sectionId = SECTION_IDS[status];
    if (!sectionId) return;
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  render(): void {
    const allKnots = this.store.getKnots();
    const filter = this.ctx.getActiveFilter();

    const visible = allKnots
      .filter(k => k.status !== 'ARCHIVED')
      .filter(k => this.ctx.isKnotVisibleInFilter(k, filter));

    this.doingKnot = visible.find(k => k.status === 'DOING') ?? null;

    this.unlockables = visible
      .filter(k => k.status === 'UNLOCKABLE')
      .filter(k => filter === 'ALL' || this.ctx.getKnotContext(k) === filter)
      .sort((a, b) => {
        const fa = this.rules.getFriction(a) - this.rules.getFriction(b);
        if (fa !== 0) return fa;
        return this.rules.getImpact(b) - this.rules.getImpact(a);
      });

    this.doneKnots = visible
      .filter(k => k.status === 'DONE')
      .sort((a, b) => (b.doneAt ?? b.updatedAt ?? 0) - (a.doneAt ?? a.updatedAt ?? 0));

    this.buildDoneGroups();

    let bl = visible.filter(k => ['BLOCKED', 'SOMEDAY'].includes(k.status));
    if (filter !== 'ALL') {
      bl = bl.filter(k => this.ctx.getKnotContext(k) === filter);
    }

    if (this.backlogSort === 'friction') bl.sort((a, b) => this.rules.getFriction(b) - this.rules.getFriction(a));
    else if (this.backlogSort === 'impact') bl.sort((a, b) => this.rules.getImpact(b) - this.rules.getImpact(a));
    else bl.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    if (this.backlogDir === 'asc') bl.reverse();

    this.backlog = bl;
    this.updateMarquee();

    // Compute unchained knots for chain view
    this.unchainedKnots = visible.filter(k => !k.chainId);

    // Refresh chains (filter out any that became empty)
    this.chains = this.chainService.getChains()
      .filter(c => this.chainService.getChainSize(c.id) > 0)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private buildDoneGroups(): void {
    const groups: Record<string, { key: string; label: string; items: Knot[] }> = {};
    this.doneKnots.forEach(k => {
      const ts = k.doneAt ?? k.updatedAt ?? k.lastTouchedAt ?? k.createdAt ?? Date.now();
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          label: d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' }),
          items: [],
        };
      }
      groups[key].items.push(k);
    });
    this.doneGroups = Object.values(groups).sort((a, b) => (a.key < b.key ? 1 : -1));
  }

  private updateMarquee(): void {
    const goalVal = this.goal.getDailyGoal();
    const doneToday = this.goal.countDoneToday();
    this.goalMet = doneToday >= goalVal;
    if (!this.goalMet) {
      this.marqueeText = `Faltan ${goalVal - doneToday} hecho(s) · elegí 1 desbloqueable · 5 min · cerrá · repetí`;
    } else {
      this.marqueeText = `Mínimo cumplido · mantené la cadena`;
    }
  }

  setSortMode(mode: BacklogSort): void {
    this.backlogSort = mode;
    this.render();
  }

  toggleSortDir(): void {
    this.backlogDir = this.backlogDir === 'desc' ? 'asc' : 'desc';
    this.render();
  }

  toggleQuickEdit(): void {
    this.quickEditHidden = !this.quickEditHidden;
    localStorage.setItem('nudos_ui_quick_edit_hidden_v1', this.quickEditHidden ? '1' : '0');
  }

  private loadQuickEditPref(): void {
    this.quickEditHidden = localStorage.getItem('nudos_ui_quick_edit_hidden_v1') === '1';
  }

  setViewMode(mode: 'list' | 'chain'): void {
    this.viewMode = mode;
    localStorage.setItem('nudos_ui_view_mode', mode);
  }

  private loadViewModePref(): void {
    const stored = localStorage.getItem('nudos_ui_view_mode');
    this.viewMode = (stored === 'list' || stored === 'chain') ? stored : 'list';
  }

  handleRefresh(event: CustomEvent): void {
    this.render();
    (event.target as HTMLIonRefresherElement).complete();
  }
}
