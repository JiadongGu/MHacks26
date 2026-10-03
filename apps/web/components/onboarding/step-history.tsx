"use client";

import { useState } from "react";
import { FileHeart, Plus, ShieldCheck, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState, ErrorNote } from "@/components/ui-bits";
import { agent, errorText } from "@/lib/api-client";
import type { DigitalTwin } from "@/lib/contracts";
import { formatDate } from "@/lib/format";
import { conditionKey, medicationKey, readTwin, type TwinView } from "@/lib/twin";
import { cn } from "@/lib/utils";
import { EMPTY_HISTORY, type HistoryState } from "./history-seed";
import { twinProfile, type ProfileInput } from "./types";

type Patient = { id: string; scenario: string; displayName: string; birthDate: string | null };

const RELATIONS = ["mother", "father", "sister", "brother", "grandparent", "aunt or uncle", "other"];

/** Morgan Rivera first, then the rest in the order the agent sent them. */
export function sortPatients(list: Patient[]): Patient[] {
  const rank = (p: Patient) => (p.scenario === "baseline-adult" || /^morgan rivera/i.test(p.displayName) ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

type Props = {
  state: HistoryState;
  setState: (next: HistoryState) => void;
  profile: ProfileInput;
  onDone: () => void;
};

export function StepHistory({ state, setState, profile, onDone }: Props) {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [relation, setRelation] = useState(RELATIONS[0]);
  const [condition, setCondition] = useState("");

  async function loadPatients() {
    setLoadingList(true);
    setListError(null);
    try {
      const list = sortPatients(await agent<Patient[]>("/twin/finchnode/patients"));
      setPatients(list);
      setChoice((c) => c || list[0]?.scenario || "");
    } catch (err) {
      const text = errorText(err);
      setListError(text);
      toast.error(`Could not load records: ${text}`);
    } finally {
      setLoadingList(false);
    }
  }

  async function importRecord() {
    if (!choice) return;
    setImporting(true);
    try {
      const twin = await agent<DigitalTwin>("/twin/import", { body: { scenario: choice } });
      setState({ ...state, scenario: choice, twin: readTwin(twin.model), removed: EMPTY_HISTORY.removed });
      toast.success("Records imported.");
    } catch (err) {
      toast.error(`Import failed: ${errorText(err)}`);
    } finally {
      setImporting(false);
    }
  }

  function toggleRemoved(kind: keyof HistoryState["removed"], key: string) {
    const list = state.removed[kind];
    const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
    setState({ ...state, removed: { ...state.removed, [kind]: next } });
  }

  function addFamily() {
    const c = condition.trim();
    if (!c) return;
    setState({ ...state, family: [...state.family, { relation, condition: c, source: "self_reported" }] });
    setCondition("");
  }

  async function save() {
    setSaving(true);
    try {
      await agent("/twin/me/onboarding", {
        body: {
          profile: twinProfile(profile),
          family_history: state.family.map(({ relation: r, condition: c }) => ({ relation: r, condition: c })),
          edits: {
            conditions: { add: [], remove: state.removed.conditions },
            medications: { add: [], remove: state.removed.medications },
            allergies: { add: [], remove: state.removed.allergies },
          },
        },
      });
      onDone();
    } catch (err) {
      toast.error(`Could not save your history: ${errorText(err)}`);
    } finally {
      setSaving(false);
    }
  }

  const twin = state.twin;

  return (
    <div className="space-y-10">
      {!twin && (
        <div>
          {patients === null ? (
            <div className="max-w-[60ch] space-y-4">
              <p className="text-base">
                Pulse can read your medical record from FinchNode, a demo record service. You choose which
                record to connect. You can remove anything it finds before you continue.
              </p>
              {listError && (
                <ErrorNote
                  action={
                    <Button variant="outline" size="sm" onClick={() => void loadPatients()}>
                      Try again
                    </Button>
                  }
                >
                  Could not load the record list. {listError}
                </ErrorNote>
              )}
              <div className="flex flex-wrap items-center gap-4">
                <Button size="lg" className="h-10 px-5" onClick={() => void loadPatients()} disabled={loadingList}>
                  <FileHeart aria-hidden="true" />
                  {loadingList ? "Looking for records..." : "Import my records"}
                </Button>
                <Button variant="ghost" onClick={() => setState({ ...state, twin: readTwin({}) })}>
                  Enter my history by hand
                </Button>
              </div>
            </div>
          ) : (
            <fieldset className="max-w-xl">
              <legend className="text-xl font-semibold">Choose a record to connect</legend>
              <p className="mt-2 text-sm text-muted-foreground">
                FinchNode asks you to approve read access to conditions, medications, allergies, and lab
                results. These are synthetic demo patients.
              </p>
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {patients.map((p) => (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 px-1 py-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                        choice === p.scenario && "bg-muted/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="patient"
                        value={p.scenario}
                        checked={choice === p.scenario}
                        onChange={() => setChoice(p.scenario)}
                        className="mt-1 size-4 accent-[var(--foreground)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-base font-medium">{p.displayName}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {p.scenario}
                          {p.birthDate ? `, born ${formatDate(p.birthDate)}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Button size="lg" className="h-10 px-5" onClick={() => void importRecord()} disabled={importing || !choice}>
                  <ShieldCheck aria-hidden="true" />
                  {importing ? "Importing..." : "Authorize and import"}
                </Button>
                <Button variant="ghost" onClick={() => setPatients(null)} disabled={importing}>
                  Back
                </Button>
              </div>
            </fieldset>
          )}
        </div>
      )}

      {twin && (
        <>
          <ImportedLists twin={twin} removed={state.removed} onToggle={toggleRemoved} imported={state.scenario !== null} />

          <section aria-labelledby="fh-heading" className="max-w-xl">
            <h3 id="fh-heading" className="text-xl font-semibold">
              Family history
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Records cannot supply this. Pulse labels it self-reported.
            </p>
            {state.family.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {state.family.map((f, i) => (
                  <li
                    key={`${f.relation}-${f.condition}-${i}`}
                    className="flex items-center gap-1 rounded-md border border-border py-1 pl-3 pr-1 text-sm"
                  >
                    <span>
                      <span className="capitalize">{f.relation}</span>: {f.condition}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove family history: ${f.relation}, ${f.condition}`}
                      onClick={() => setState({ ...state, family: state.family.filter((_, j) => j !== i) })}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="mt-4 grid grid-cols-[8rem_1fr_auto] items-end gap-3 max-sm:grid-cols-1"
              onSubmit={(e) => {
                e.preventDefault();
                addFamily();
              }}
            >
              <div className="flex flex-col gap-2">
                <label htmlFor="fh-rel" className="text-sm font-medium">
                  Relation
                </label>
                <NativeSelect id="fh-rel" value={relation} onChange={(e) => setRelation(e.target.value)}>
                  {RELATIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="fh-cond" className="text-sm font-medium">
                  Condition
                </label>
                <Input
                  id="fh-cond"
                  value={condition}
                  maxLength={200}
                  placeholder="type 2 diabetes"
                  onChange={(e) => setCondition(e.target.value)}
                />
              </div>
              <Button type="submit" variant="outline" disabled={condition.trim() === ""}>
                <Plus aria-hidden="true" />
                Add
              </Button>
            </form>
          </section>

          <div className="flex flex-wrap items-center gap-4">
            <Button size="lg" className="h-10 px-5" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving..." : "Save and continue"}
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setState({ ...EMPTY_HISTORY })}
            >
              Choose a different record
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ImportedLists({
  twin,
  removed,
  onToggle,
  imported,
}: {
  twin: TwinView;
  removed: HistoryState["removed"];
  onToggle: (kind: keyof HistoryState["removed"], key: string) => void;
  imported: boolean;
}) {
  const nothing =
    twin.conditions.length + twin.medications.length + twin.allergies.length + twin.labs.length === 0;
  if (nothing) {
    return (
      <EmptyState title={imported ? "The record has no conditions, medications, allergies, or labs." : "No history entered"}>
        You can still add family history below. Pulse works with what you give it.
      </EmptyState>
    );
  }
  return (
    <div className="max-w-xl space-y-8">
      <p className="text-sm text-muted-foreground">
        Imported from your record. Remove anything that is wrong. Removed items are dropped from your twin.
      </p>
      <RemovableList
        title="Conditions"
        empty="None on record."
        items={twin.conditions.map((c) => ({
          key: conditionKey(c),
          text: c.display,
          meta: c.status && c.status !== "active" ? c.status : null,
        }))}
        removed={removed.conditions}
        onToggle={(k) => onToggle("conditions", k)}
      />
      <RemovableList
        title="Medications"
        empty="None on record."
        items={twin.medications.map((m) => ({ key: medicationKey(m), text: m.display, meta: m.class ?? null }))}
        removed={removed.medications}
        onToggle={(k) => onToggle("medications", k)}
      />
      <RemovableList
        title="Allergies"
        empty="None on record."
        items={twin.allergies.map((a) => ({ key: a, text: a, meta: null }))}
        removed={removed.allergies}
        onToggle={(k) => onToggle("allergies", k)}
      />
      <section aria-labelledby="labs-heading">
        <h3 id="labs-heading" className="text-base font-semibold">
          Recent labs
        </h3>
        {twin.labs.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">None on record.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {twin.labs.slice(0, 8).map((l) => (
              <li key={`${l.loinc ?? l.display}-${l.date ?? ""}`} className="flex justify-between gap-4 py-2 text-sm">
                <span>{l.display}</span>
                <span className="font-mono text-muted-foreground">
                  {l.value} {l.unit ?? ""}
                  {l.date ? `, ${l.date}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RemovableList({
  title,
  empty,
  items,
  removed,
  onToggle,
}: {
  title: string;
  empty: string;
  items: { key: string; text: string; meta: string | null }[];
  removed: string[];
  onToggle: (key: string) => void;
}) {
  const id = `list-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="text-base font-semibold">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border border-y border-border">
          {items.map((it) => {
            const gone = removed.includes(it.key);
            return (
              <li key={it.key} className="flex items-center justify-between gap-4 py-2">
                <span className={cn("min-w-0 text-sm", gone && "text-muted-foreground line-through")}>
                  {it.text}
                  {it.meta && <span className="ml-2 text-xs text-muted-foreground">{it.meta}</span>}
                  {gone && <span className="ml-2 text-xs no-underline">(will be removed)</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${gone ? "Keep" : "Remove"} ${title.toLowerCase()}: ${it.text}`}
                  onClick={() => onToggle(it.key)}
                >
                  {gone ? <Undo2 aria-hidden="true" /> : <X aria-hidden="true" />}
                  {gone ? "Keep" : "Remove"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
