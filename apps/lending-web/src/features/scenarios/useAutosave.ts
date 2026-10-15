import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@vnext/api-client";
import { scenarioUpdateRequestSchema } from "@vnext/contracts";
import type { ScenarioUpdateRequest } from "@vnext/contracts";
import type { ScenarioDetail } from "./model.js";
import { saveScenario, scenarioKeys } from "./api.js";

export type SaveState = "saved" | "saving" | "unsaved" | "invalid" | "failed" | "conflict";

function comparable(payload: ScenarioUpdateRequest): string {
  return JSON.stringify({ ...payload, expectedVersion: "", metadataRevision: "" });
}

export function useScenarioAutosave(initial: ScenarioDetail, value: Omit<ScenarioUpdateRequest, "expectedVersion" | "metadataRevision">) {
  const queryClient = useQueryClient();
  const versionRef = useRef(initial.scenario.version);
  const metadataRevisionRef = useRef(initial.metadataRevision?.id ?? "default-v1");
  const latestValueRef = useRef(value);
  latestValueRef.current = value;
  const baselineRef = useRef(comparable({ ...value, expectedVersion: initial.scenario.version, metadataRevision: initial.metadataRevision?.id ?? "default-v1" }));
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const conflictRef = useRef(false);
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState<Error | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: ScenarioUpdateRequest) => saveScenario(initial.scenario.id, payload),
    onSuccess: async (saved) => {
      versionRef.current = saved.version;
      queryClient.setQueryData<ScenarioDetail>(scenarioKeys.detail(initial.scenario.id), (current) => current ? { ...current, scenario: saved } : current);
      await queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
    },
    retry: false,
  });
  const snapshot = JSON.stringify(value);
  const submit = useCallback((captured: typeof value) => {
    queueRef.current = queueRef.current.then(async () => {
      if (conflictRef.current) return;
      setState("saving");
      setError(null);
      try {
        const body = { ...captured, expectedVersion: versionRef.current, metadataRevision: metadataRevisionRef.current };
        await mutation.mutateAsync(body);
        baselineRef.current = comparable(body);
        const latestPayload = { ...latestValueRef.current, expectedVersion: versionRef.current, metadataRevision: metadataRevisionRef.current };
        setState(comparable(latestPayload) === comparable(body) ? "saved" : "unsaved");
      } catch (caught) {
        const saveError = caught instanceof Error ? caught : new Error("Could not save this scenario.");
        setError(saveError);
        const conflict = caught instanceof ApiError && caught.status === 409;
        conflictRef.current = conflict;
        setState(conflict ? "conflict" : "failed");
      }
    });
  }, [mutation.mutateAsync]);

  useEffect(() => {
    const body = { ...value, expectedVersion: versionRef.current, metadataRevision: metadataRevisionRef.current };
    if (comparable(body) === baselineRef.current || conflictRef.current) return;
    const validation = scenarioUpdateRequestSchema.safeParse(body);
    if (!validation.success) {
      setState("invalid");
      setError(new Error(validation.error.issues[0]?.message ?? "Review the highlighted fields."));
      return;
    }
    const timer = window.setTimeout(() => submit(value), 650);
    setState("unsaved");
    return () => window.clearTimeout(timer);
  }, [snapshot, submit]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const body = { ...value, expectedVersion: versionRef.current, metadataRevision: metadataRevisionRef.current };
      if (comparable(body) !== baselineRef.current) { event.preventDefault(); event.returnValue = true; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [snapshot]);

  const retry = useCallback(() => {
    conflictRef.current = false;
    submit(value);
  }, [submit, snapshot]);

  return { state, error, retry, reloadConflict: state === "conflict" };
}
