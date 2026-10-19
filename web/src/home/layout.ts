import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb } from "../lib/supabase";
import { sectionLevel, type Access } from "../lib/access";
import { SECTIONS } from "../sections";
import { useAuth } from "../auth/AuthProvider";

// ---------------------------------------------------------------------------
// What can appear on the home screen
// ---------------------------------------------------------------------------
export type PanelId = "system" | "squads" | "squadFeedback";

export interface PanelDef {
  id: PanelId;
  label: string;
  description: string;
  /** whether this user's roles can have the panel at all */
  available: (a: Access | null) => boolean;
}

const hasRole = (a: Access | null, ...roles: string[]) => (a?.roles || []).some(r => roles.includes(r.role));
const levelIn = (a: Access | null, section: Parameters<typeof sectionLevel>[1], ...levels: string[]) =>
  levels.includes(sectionLevel(a, section));

export const PANELS: PanelDef[] = [
  {
    id: "system",
    label: "System totals",
    description: "Clubs, swimmers, personal bests and feedback across everything you can see",
    available: a => hasRole(a, "superadmin", "club_admin")
  },
  {
    id: "squads",
    label: "Squads at a glance",
    description: "Swimmers and feedback posts per squad",
    available: a => levelIn(a, "roster", "E", "R", "SR") || levelIn(a, "feedback", "E", "SE")
  },
  {
    id: "squadFeedback",
    label: "Squad feedback",
    description: "Latest feedback for a squad from the head coach and other coaches",
    available: a => levelIn(a, "feedback", "E", "SE", "R")
  }
];

/** Buttons (section shortcuts) shown by default; the rest are switched on in Settings. */
const DEFAULT_BUTTONS = ["attendance", "feedback"];

// ---------------------------------------------------------------------------
// Saved layout: order + visibility for panels and buttons
// ---------------------------------------------------------------------------
export interface LayoutItem { id: string; visible: boolean; }
export interface HomeLayout { panels: LayoutItem[]; buttons: LayoutItem[]; }

export function defaultLayout(): HomeLayout {
  return {
    panels: PANELS.map(p => ({ id: p.id, visible: true })),
    buttons: SECTIONS.map(s => ({ id: s.key, visible: DEFAULT_BUTTONS.includes(s.key) }))
  };
}

/** Keep the saved order, drop unknown ids, append anything new with its default. */
function mergeList(saved: LayoutItem[] | undefined, defaults: LayoutItem[]): LayoutItem[] {
  const known = new Map(defaults.map(d => [d.id, d]));
  const out: LayoutItem[] = [];
  for (const item of saved || []) {
    if (known.has(item.id) && !out.some(o => o.id === item.id)) out.push({ id: item.id, visible: !!item.visible });
  }
  for (const d of defaults) if (!out.some(o => o.id === d.id)) out.push(d);
  return out;
}

export function normaliseLayout(raw: unknown): HomeLayout {
  const d = defaultLayout();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<HomeLayout>;
  return { panels: mergeList(r.panels, d.panels), buttons: mergeList(r.buttons, d.buttons) };
}

/** Only what this user's roles allow, in their saved order. */
export function allowedItems(layout: HomeLayout, access: Access | null) {
  const panels = layout.panels.filter(p => PANELS.find(d => d.id === p.id)?.available(access));
  const buttons = layout.buttons.filter(b => {
    const s = SECTIONS.find(x => x.key === b.id);
    return s && sectionLevel(access, s.section) !== "N";
  });
  return { panels, buttons };
}

// user_home_layout is newer than the generated types (migration 20261019140000).
const layoutTable = () => (sb.from.bind(sb) as unknown as (t: string) => ReturnType<typeof sb.from>)("user_home_layout");

export function useHomeLayout() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();
  const key = ["home_layout", userId];

  const q = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await layoutTable().select("layout").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return normaliseLayout((data as { layout?: unknown } | null)?.layout);
    }
  });

  const mutation = useMutation({
    // One shared scope: rapid changes save one after another, so the last change always wins.
    scope: { id: "home_layout" },
    mutationFn: async ({ layout }: { layout: HomeLayout; previous: HomeLayout | undefined }) => {
      const { error } = await layoutTable().upsert({ user_id: userId, layout, updated_at: new Date().toISOString() } as never);
      if (error) throw error;
      return layout;
    },
    onError: (_e, vars) => { if (vars.previous) qc.setQueryData(key, vars.previous); }
  });

  // Update the screen immediately, then save in the background (rolled back if the save fails).
  const setLayout = (layout: HomeLayout) => {
    const previous = qc.getQueryData<HomeLayout>(key);
    qc.setQueryData(key, layout);
    mutation.mutate({ layout, previous });
  };

  return {
    // If the layout can't be read (e.g. table not migrated yet), fall back to defaults.
    layout: q.data ?? defaultLayout(),
    loading: q.isLoading,
    loadError: q.error as Error | null,
    setLayout,
    saveState: mutation
  };
}
