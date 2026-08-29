(() => {
  "use strict";

  const catalog = window.QWENFIGHT_SCENARIO_CATALOG;
  if (!catalog?.datasets?.length) {
    document.body.textContent = "catalog.js did not load or contains no datasets";
    return;
  }

  const elements = Object.fromEntries([
    "page-title", "subtitle", "summary", "dataset", "baseline", "baseline-cards", "range",
    "filter", "tie-rule", "compact", "focus-fork", "play", "reset", "speed", "previous", "next",
    "copy-link", "export-json", "export-csv", "status", "selection-count",
    "scenario-search", "hardware-filter", "intervention-filter",
    "scenario-picker", "comparison-context", "method-note", "legend", "stream", "privacy-note",
    "playback-stage", "playback-position", "playback-tokens",
  ].map((id) => [id, document.getElementById(id)]));
  const byCase = new Map(catalog.cases.map((item) => [item.id, item]));
  const byDataset = new Map(catalog.datasets.map((item) => [item.id, item]));
  const baselineIds = new Set(catalog.baseline_ids || catalog.cases.map((item) => item.id));
  const comparisonMatrix = new Map(
    (catalog.comparison_matrix || []).map((item) => [item.baseline_id, item.comparisons || []]),
  );
  const loadedScripts = new Map();
  const params = new URLSearchParams(window.location.hash.slice(1));
  const maxComparisons = Number(catalog.max_comparisons || 4);
  let datasetMeta;
  let dataset;
  let baselineId;
  let comparisonIds = [];
  let visibleNodes = [];
  let playbackStates = [];
  let playbackNodes = new Map();
  let playback = {running:false, epoch:0, index:0, node:null};

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const unique = (items) => [...new Set(items)];
  const slug = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "").toLowerCase();
  const pct = (value) => value >= .01
    ? `${(value * 100).toFixed(1)}%`
    : `${(value * 100).toPrecision(2)}%`;
  const margin = (value) => Number(value).toFixed(3).replace(/\.000$/, "");
  const caseFor = (id) => byCase.get(id);
  const shardKey = (id) => `${datasetMeta.id}/${id}`;
  const shardFor = (id) => window.QWENFIGHT_RUNS[shardKey(id)];
  const branchShardFor = (id) => window.QWENFIGHT_BRANCHES[shardKey(id)];
  const activeIds = () => [baselineId, ...comparisonIds];

  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.addEventListener("load", resolve, {once:true});
      script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {once:true});
      document.head.append(script);
    });
    loadedScripts.set(src, promise);
    return promise;
  }

  async function loadRun(id) {
    if (!shardFor(id)) await loadScript(`${datasetMeta.run_root}/${slug(id)}.js`);
    const shard = shardFor(id);
    if (!shard) throw new Error(`Run shard loaded without registering ${shardKey(id)}`);
    if (datasetMeta.branch_cases?.includes(id) && !branchShardFor(id)) {
      await loadScript(`${datasetMeta.branch_root}/${slug(id)}.js`);
    }
    return shard;
  }

  function casesForDataset() {
    return datasetMeta.cases.map(caseFor).filter(Boolean);
  }

  function baselineCasesForDataset() {
    return casesForDataset().filter((item) => baselineIds.has(item.id));
  }

  function comparisonEntries() {
    const available = new Set(datasetMeta.cases);
    const configured = comparisonMatrix.get(baselineId);
    if (!configured) {
      return casesForDataset()
        .filter((item) => item.id !== baselineId)
        .map((item) => ({case_id:item.id, axis:"unrestricted", priority:"", rationale:""}));
    }
    return configured.filter((item) => available.has(item.case_id));
  }

  function comparisonEntry(caseId) {
    return comparisonEntries().find((item) => item.case_id === caseId);
  }

  function groupedOptions(select, cases, selected) {
    const groups = new Map();
    for (const item of cases) {
      const key = `${item.hardware || "Other"} / ${item.architecture || "runtime"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    select.replaceChildren(...[...groups].map(([label, items]) => {
      const group = document.createElement("optgroup");
      group.label = label;
      group.append(...items.map((item) => {
        const option = el("option", "", item.label);
        option.value = item.id;
        return option;
      }));
      return group;
    }));
    select.value = selected;
  }

  function chip(text, kind="") {
    return el("span", `chip ${kind}`.trim(), text || "unspecified");
  }

  function renderBaselineCards() {
    const branchCases = new Set(datasetMeta.branch_cases || []);
    elements["baseline-cards"].replaceChildren(...baselineCasesForDataset().map((item) => {
      const selected = item.id === baselineId;
      const button = el("button", `baseline-card${selected ? " selected" : ""}`);
      button.type = "button";
      button.dataset.baselineId = item.id;
      button.style.setProperty("--case", item.color || "#58b7ff");
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", selected ? "true" : "false");
      button.title = `Use ${item.label} as the comparison baseline`;
      button.addEventListener("click", () => {
        if (item.id === baselineId) return;
        elements.baseline.value = item.id;
        switchBaseline(item.id).catch((error) => {
          elements.status.textContent = error.message;
          console.error(error);
        });
      });

      const heading = el("span", "baseline-card-heading");
      heading.append(
        el("span", "baseline-card-hardware", item.hardware || item.short_label || item.label),
        el("span", "baseline-card-arch", item.architecture || "GPU"),
      );
      const coordinates = el("span", "baseline-coordinates");
      coordinates.append(
        el("span", "baseline-coordinate", item.attention || "Triton"),
        el("span", "baseline-coordinate", `${item.weights || "BF16"} weights`),
        el("span", "baseline-coordinate", `${item.kv_cache || "BF16"} KV`),
      );
      const runtime = el("span", "baseline-runtime", item.runtime || "runtime recorded");
      runtime.append(el(
        "span",
        "baseline-future",
        branchCases.has(item.id) ? "100-token futures available" : "one-step logits only",
      ));
      const foot = el("span", "baseline-card-foot");
      foot.append(
        runtime,
        el("span", "baseline-card-action", selected ? "✓ Current baseline" : "Select baseline →"),
      );
      button.append(
        el("span", "baseline-card-kicker", selected ? "Selected reference universe" : "Available reference universe"),
        heading,
        coordinates,
        foot,
      );
      return button;
    }));
  }

  function renderPicker() {
    const search = elements["scenario-search"].value.trim().toLowerCase();
    const hardware = elements["hardware-filter"].value;
    const intervention = elements["intervention-filter"].value;
    const selected = new Set(comparisonIds);
    const entries = [
      {case_id:baselineId, axis:"starting point", priority:"BASE", rationale:"Canonical BF16/Triton/BF16-key/value-cache starting point."},
      ...comparisonEntries(),
    ];
    const branchCases = new Set(datasetMeta.branch_cases || []);
    elements["scenario-picker"].replaceChildren(...entries.map((entry) => {
      const item = caseFor(entry.case_id);
      const haystack = [
        item.label, item.hardware, item.architecture, item.attention, item.weights,
        item.kv_cache, item.runtime, item.intervention, entry.axis, entry.priority,
      ].filter(Boolean).join(" ").toLowerCase();
      const hidden = (search && !haystack.includes(search)) ||
        (hardware && item.hardware !== hardware) ||
        (intervention && item.intervention !== intervention);
      const label = el(
        "label",
        `scenario-choice${selected.has(item.id) ? " selected" : ""}${item.id === baselineId ? " baseline" : ""}${hidden ? " hidden" : ""}`,
      );
      label.style.setProperty("--case", item.color || "#58b7ff");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected.has(item.id) || item.id === baselineId;
      input.disabled = item.id === baselineId;
      input.addEventListener("change", async () => {
        if (input.checked) {
          if (comparisonIds.length >= maxComparisons) {
            input.checked = false;
            elements.status.textContent = `Maximum ${maxComparisons} comparisons plus the baseline`;
            return;
          }
          comparisonIds.push(item.id);
          elements.status.textContent = `Loading ${item.short_label || item.label}…`;
          try {
            await loadRun(item.id);
          } catch (error) {
            comparisonIds = comparisonIds.filter((id) => id !== item.id);
            elements.status.textContent = error.message;
            renderPicker();
            return;
          }
        } else {
          comparisonIds = comparisonIds.filter((id) => id !== item.id);
        }
        syncHash();
        renderPicker();
        renderLegend();
        render();
      });
      const title = el("span", "scenario-title", item.short_label || item.label);
      const meta = el("span", "scenario-meta");
      meta.append(
        chip(entry.priority || "eligible", String(entry.priority || "").toLowerCase()),
        chip(String(entry.axis || "comparison").replaceAll("_", " "), "axis"),
        chip(`${item.hardware || "?"} / ${item.architecture || "?"}`, "hardware"),
        chip(item.attention || "attention"),
        chip(`${item.weights || "?"} weights`, "weights"),
        chip(`${item.kv_cache || "?"} KV`, "kv"),
      );
      const pairCaptured = item.id === baselineId
        ? branchCases.has(item.id)
        : branchCases.has(baselineId) && branchCases.has(item.id);
      const flips = Number(entry.flip_counts?.[datasetMeta.id] || 0);
      const coverage = el(
        "span",
        `scenario-coverage ${pairCaptured ? "captured" : "uncaptured"}`,
        item.id === baselineId
          ? (branchCases.has(item.id) ? "future capture connected" : "one-step logits only")
          : `${flips.toLocaleString()} measured fork${flips === 1 ? "" : "s"} · ${pairCaptured ? "100-token futures connected" : "one-step only"}`,
      );
      const rationale = el("span", "scenario-rationale", entry.rationale || "Eligible comparison.");
      label.title = entry.rationale || item.label;
      label.append(input, title, meta, coverage, rationale);
      return label;
    }));
    elements["selection-count"].textContent =
      `· starting point + ${comparisonIds.length}/${maxComparisons} · ${comparisonEntries().length} valid choices`;
    if (elements["comparison-context"]) {
      const policy = catalog.comparison_policy;
      elements["comparison-context"].textContent = policy?.summary ||
        "Only comparisons valid for the selected starting point are shown.";
    }
  }

  function renderLegend() {
    elements.legend.replaceChildren(...activeIds().map((id) => {
      const item = caseFor(id);
      const node = el("span", "legend-item");
      const dot = el("span", "dot");
      dot.style.background = item.color || "#58b7ff";
      node.append(dot, document.createTextNode(
        `${id === baselineId ? "BASE · " : ""}${item.short_label || item.label}`,
      ));
      return node;
    }));
  }

  function syncHash() {
    const next = new URLSearchParams();
    next.set("dataset", datasetMeta.id);
    next.set("baseline", baselineId);
    next.set("runs", comparisonIds.join(","));
    next.set("range", elements.range.value || "0");
    next.set("ties", elements["tie-rule"].value);
    window.history.replaceState(null, "", `#${next}`);
  }

  function token(id) {
    return dataset.tokens[String(id)] || {
      id, decoded:`token ${id}`, display:`#${id}`, vocab_piece:`#${id}`,
    };
  }

  function predictionAt(caseId, index) {
    const shard = shardFor(caseId);
    const legacy = elements["tie-rule"].value === "legacy-topk";
    const tokenIds = legacy && shard.legacy_top1_token_ids
      ? shard.legacy_top1_token_ids
      : shard.top1_token_ids;
    const recordedMatches = legacy && shard.legacy_recorded_matches
      ? shard.legacy_recorded_matches
      : shard.recorded_matches;
    return {
      case_id:caseId,
      top1_token_id:tokenIds[index],
      probability:shard.top1_probabilities[index],
      margin:shard.top1_margins[index],
      recorded_rank:shard.recorded_ranks[index],
      recorded_match:recordedMatches[index],
    };
  }

  function branchAt(caseId, position) {
    return branchShardFor(caseId)?.branches?.[String(position)] || null;
  }

  const gradeInfo = (value) => ({
    "balanced-tool-output": ["complete", "complete tool-call structure"],
    "invalid-structured-output": ["failed", "FAILED BEFORE EXECUTION · invalid tool structure"],
    "incomplete-at-allowance-needs-extension": ["incomplete", "incomplete at generation allowance"],
    "incomplete-at-256-token-cap": ["incomplete", "open structure at 256-token cap"],
    "incomplete-at-100-token-cap-extension-nondeterministic": ["incomplete", "100-token path did not replay deterministically"],
    "incomplete/indecisive-at-100-token-cap": ["incomplete", "incomplete / indecisive at 100-token cap"],
    "prose-or-no-complete-tool-envelope": ["none", "prose / no completed tool call"],
  }[value] || ["unknown", "structure not graded"]);

  const routeLabel = (value) => ({
    "exact-recorded-tool-sequence": "same tools and arguments as recorded route",
    "recorded-tool-sequence-prefix": "prefix of recorded tool sequence",
    "different-tool-or-arguments": "different tool or arguments from recorded route",
    "no-complete-generated-tool-yet": "no complete generated tool call yet",
    "no-recorded-tool-after-root": "no recorded tool after this root",
  }[value] || null);

  function toolCallNode(call, index) {
    const details = el("details", "tool-call");
    const summary = el("summary", "", `${index + 1}. ${call.function || "unknown tool"}`);
    const argumentsNode = el("dl", "tool-arguments");
    for (const argument of call.parameters || []) {
      argumentsNode.append(
        el("dt", "", argument.name || "argument"),
        el("dd", "", typeof argument.value === "string"
          ? argument.value
          : JSON.stringify(argument.value)),
      );
    }
    if (!argumentsNode.children.length) argumentsNode.append(el("dd", "", "No retained arguments"));
    details.append(summary, argumentsNode);
    return details;
  }

  function recordedRouteNode(state) {
    const route = dataset.ranges[state.row.range_index]?.recorded_route;
    const node = el("div", "recorded-route");
    if (!route || !route.tool_call_count) {
      node.append(el("strong", "", "Recorded path · no tool call in this response"));
      return node;
    }
    const failed = route.observed_tool_result === "error";
    node.classList.add(failed ? "runtime-failed" : "runtime-observed");
    node.append(el(
      "strong",
      "",
      failed
        ? "RECORDED TOOL RESULT · ERROR RETURNED"
        : "Recorded tool result · no explicit error observed",
    ));
    node.append(el(
      "span",
      "",
      `${route.tool_call_count} call${route.tool_call_count === 1 ? "" : "s"} · ${(route.tool_names || []).join(", ")}`,
    ));
    if (route.recovery_kind) {
      node.append(el(
        "span",
        "recorded-recovery",
        `Recorded recovery: ${String(route.recovery_kind).replaceAll("-", " ")}${route.recovery_of_candidate_id ? ` after ${route.recovery_of_candidate_id}` : ""}`,
      ));
    }
    return node;
  }

  function branchPanel(state) {
    const panel = el("details", "fork-panel");
    const records = activeIds().map((id) => [id, branchAt(id, state.row.target_position)]);
    const captured = records.filter(([,record]) => record).length;
    const invalid = records.filter(([,record]) => record?.structural_grade === "invalid-structured-output").length;
    const summary = el(
      "summary",
      "fork-summary",
      `${invalid ? "⚠ FAILED TOOL STRUCTURE · " : "↳ DIVERGING FUTURES · "}${captured} captured / ${records.length} selected lanes`,
    );
    const body = el("div", "fork-body");
    body.append(recordedRouteNode(state));
    const explanation = el(
      "p",
      "fork-explanation",
      "These are recursive greedy continuations from the measured fork token. They are counterfactuals, not the shared recorded transcript. Generated calls were inspected but not executed.",
    );
    body.append(explanation);
    const lanes = el("div", "future-lanes");
    const laneStates = [];
    for (const [caseId,record] of records) {
      const item = caseFor(caseId);
      const lane = el("section", `future-lane${record ? " captured" : " unavailable"}`);
      lane.style.setProperty("--case", item.color || "#58b7ff");
      lane.append(el(
        "h4",
        "future-case",
        `${caseId === baselineId ? "BASE · " : ""}${item.short_label || item.label}`,
      ));
      if (!record) {
        lane.append(el(
          "p",
          "future-unavailable",
          datasetMeta.branch_cases?.includes(caseId)
            ? "No independent suffix was retained at this root."
            : "No recursive counterfactual capture is connected for this scenario/platform. Availability has not been inferred from the one-step logit run.",
        ));
        lanes.append(lane);
        continue;
      }
      const [gradeClass,gradeLabel] = gradeInfo(record.structural_grade);
      const badges = el("div", "future-badges");
      badges.append(
        el("span", `future-grade ${gradeClass}`, gradeLabel),
        el("span", "future-runtime", record.generated_tool_calls?.length
          ? "RUNTIME · NOT EXECUTED / UNKNOWN"
          : "RUNTIME · no generated call"),
      );
      const route = routeLabel(record.recorded_route_tool_comparison);
      if (route) badges.append(el("span", "future-route", route));
      if (record.extension_mismatch_step) {
        badges.append(el("span", "future-route", `extension diverged at branch token ${record.extension_mismatch_step}`));
      }
      lane.append(badges);
      const flow = el("div", "future-flow");
      const tokenNodes = (record.token_ids || []).map((id,index) => {
        const value = token(id);
        const node = el("span", `future-token${index === 0 ? " root" : ""}`, value.display);
        node.dataset.tokenId = String(id);
        node.title = `${index === 0 ? "measured fork winner" : "counterfactual greedy token"} ${index + 1} · id ${id} · ${JSON.stringify(value.decoded)}`;
        flow.append(node);
        return node;
      });
      lane.append(flow);
      const rootPrediction = state.predictions.find((value) => value.case_id === caseId);
      if (tokenNodes.length && rootPrediction && Number(tokenNodes[0].dataset.tokenId) !== rootPrediction.top1_token_id) {
        lane.append(el("p", "root-warning", "Captured branch root differs under the currently selected tie rule."));
      }
      if (record.generated_tool_calls?.length) {
        const calls = el("div", "generated-calls");
        calls.append(el("strong", "", `Generated tool call${record.generated_tool_calls.length === 1 ? "" : "s"} · never executed`));
        calls.append(...record.generated_tool_calls.map(toolCallNode));
        lane.append(calls);
      } else if (gradeClass === "failed") {
        lane.append(el("div", "preexecution-failure", "The tool envelope broke before a callable request existed."));
      }
      lane.append(el("div", "future-return", "↩ discarded; recorded path resumes"));
      laneStates.push({record,lane,flow,tokenNodes});
      lanes.append(lane);
    }
    body.append(lanes);
    panel.append(summary, body);
    const maximum = laneStates.length
      ? Math.max(...laneStates.map((item) => item.tokenNodes.length))
      : 0;
    let cursor = 0;
    const reveal = (count) => {
      cursor = Math.max(0, Math.min(Number(count), maximum));
      const heads = [];
      for (const laneState of laneStates) {
        laneState.tokenNodes.forEach((node,index) => {
          node.classList.toggle("revealed", index < cursor);
          node.classList.remove("future-head", "future-converged", "future-diverged");
        });
        const head = laneState.tokenNodes[cursor - 1];
        if (head) heads.push(head);
        laneState.flow.scrollTop = laneState.flow.scrollHeight;
      }
      const counts = new Map();
      for (const head of heads) counts.set(head.dataset.tokenId, (counts.get(head.dataset.tokenId) || 0) + 1);
      for (const head of heads) {
        head.classList.add("future-head");
        if (heads.length > 1) head.classList.add(counts.get(head.dataset.tokenId) > 1 ? "future-converged" : "future-diverged");
      }
    };
    reveal(0);
    return {
      panel,
      maximum,
      get cursor() { return cursor; },
      complete:false,
      reveal,
      reset() {
        cursor = 0;
        this.complete = false;
        panel.open = false;
        panel.classList.remove("playing", "returning");
        reveal(0);
      },
    };
  }

  function rowState(row, index) {
    const predictions = activeIds().map((id) => predictionAt(id, index));
    const base = predictions[0];
    const winners = new Set(predictions.map((item) => item.top1_token_id));
    return {
      row, index, predictions, base,
      flip:predictions.slice(1).some((item) => item.top1_token_id !== base.top1_token_id),
      scatter:winners.size >= 3,
      distinct:winners.size,
    };
  }

  function eligible(state) {
    if (elements.filter.value === "flips") return state.flip;
    if (elements.filter.value === "recorded") return !state.base.recorded_match;
    if (elements.filter.value === "scatter") return state.scatter;
    return true;
  }

  function predictionCard(prediction, base) {
    const item = caseFor(prediction.case_id);
    const changed = prediction.top1_token_id !== base.top1_token_id;
    const card = el(
      "div",
      `prediction${changed ? " diverged" : ""}${prediction.case_id === baselineId ? " baseline" : ""}`,
    );
    card.style.setProperty("--case", item.color || "#58b7ff");
    const top = token(prediction.top1_token_id);
    card.title = [
      item.label,
      `token id ${top.id}`,
      `vocab piece ${top.vocab_piece}`,
      `decoded ${JSON.stringify(top.decoded)}`,
      `winner probability ${prediction.probability}`,
      `top-one/top-two logit margin ${prediction.margin}`,
      `recorded token rank ${prediction.recorded_rank}`,
    ].join("\n");
    card.append(
      el("div", "case-name", `${prediction.case_id === baselineId ? "BASE · " : ""}${item.short_label || item.label}`),
      el("span", "pred-token", top.display),
    );
    const badges = el("div", "badges");
    badges.append(
      el("span", "badge", `p ${pct(prediction.probability)}`),
      el("span", "badge", `margin ${margin(prediction.margin)}`),
      el(
        "span",
        `badge${prediction.recorded_match ? "" : " bad"}`,
        prediction.recorded_match ? "recorded ✓" : `recorded #${prediction.recorded_rank}`,
      ),
    );
    if (prediction.case_id !== baselineId) {
      badges.append(el(
        "span",
        `badge${changed ? " bad" : ""}`,
        changed ? "base winner ✕" : "base winner ✓",
      ));
    }
    card.append(badges);
    return card;
  }

  function tokenRow(state) {
    const node = el(
      "div",
      `token-row${state.flip ? " flip" : ""}${state.scatter ? " scatter" : ""}`,
    );
    node.dataset.flip = state.flip ? "1" : "0";
    node.dataset.position = state.row.target_position;
    node.dataset.playbackIndex = state.index;
    node.append(el("div", "position", state.row.target_position.toLocaleString()));
    const recordedToken = token(state.row.recorded_token_id);
    const recorded = el("div", "recorded");
    recorded.append(
      el("span", `token${state.base.recorded_match ? "" : " recorded-miss"}`, recordedToken.display),
      el("span", "token-meta", `id ${recordedToken.id} · baseline rank ${state.base.recorded_rank}`),
    );
    node.append(recorded);
    const predictions = el("div", "predictions");
    predictions.append(...state.predictions.map((item) => predictionCard(item, state.base)));
    if (state.scatter) {
      predictions.append(el(
        "div", "scatter-note",
        `${state.distinct} distinct winners from ${state.predictions.length} selected runs`,
      ));
    }
    node.append(predictions);
    if (state.flip) {
      node.branchUI = branchPanel(state);
      node.append(node.branchUI.panel);
    }
    return node;
  }

  function gapRow(states) {
    const node = el("div", "gap-row");
    const first = states[0].row.target_position;
    const last = states[states.length - 1].row.target_position;
    node.append(el(
      "div", "position",
      first === last ? first.toLocaleString() : `${first.toLocaleString()}–${last.toLocaleString()}`,
    ));
    const flow = el("div", "gap-flow");
    for (const state of states) {
      const recorded = token(state.row.recorded_token_id);
      const tokenNode = el("span", "gap-token playback-node", recorded.display);
      tokenNode.dataset.position = state.row.target_position;
      tokenNode.dataset.playbackIndex = state.index;
      tokenNode.title = `${state.row.target_position.toLocaleString()} · all selected runs agree on ${JSON.stringify(token(state.base.top1_token_id).decoded)}`;
      flow.append(tokenNode);
    }
    node.append(flow);
    return node;
  }

  function selectedRangeStates() {
    const states = dataset.rows.map(rowState);
    if (elements.range.value === "all") return states;
    const rangeIndex = Number(elements.range.value);
    return states.filter((item) => item.row.range_index === rangeIndex);
  }

  function outputDivider(rangeIndex) {
    const range = dataset.ranges[rangeIndex];
    const node = el("section", "output-divider");
    node.append(
      el("strong", "", range?.candidate_id || `Output ${rangeIndex + 1}`),
      el(
        "span",
        "",
        `${Number(range?.rows || 0).toLocaleString()} recorded tokens${range?.description ? ` · ${range.description}` : ""}`,
      ),
    );
    return node;
  }

  function renderSummary(states) {
    const flips = states.filter((item) => item.flip).length;
    const scatters = states.filter((item) => item.scatter).length;
    const baseMisses = states.filter((item) => !item.base.recorded_match).length;
    const capturedFutures = states
      .filter((item) => item.flip)
      .reduce((count,item) => count + item.predictions.filter(
        (prediction) => branchAt(prediction.case_id, item.row.target_position),
      ).length, 0);
    elements.summary.replaceChildren(...[
      [states.length.toLocaleString(), "recorded positions"],
      [activeIds().length, "selected runs"],
      [flips.toLocaleString(), "baseline disagreements"],
      [scatters.toLocaleString(), "3+ winner scatters"],
      [baseMisses.toLocaleString(), "baseline vs recorded"],
      [capturedFutures.toLocaleString(), "captured fork futures"],
      [datasetMeta.id.toUpperCase(), "prompt dataset"],
    ].map(([value,label]) => {
      const node = el("div", "stat");
      node.append(el("strong", "", String(value)), el("span", "", label));
      return node;
    }));
  }

  function stopPlayback() {
    playback.running = false;
    playback.epoch += 1;
    if (playback.node) playback.node.classList.remove("playback-current");
    document.querySelectorAll(".fork-panel.playing").forEach((panel) => {
      panel.classList.remove("playing", "focused");
    });
    playback.node = null;
    elements.play.textContent = playback.index >= playbackStates.length ? "▶ Replay outputs" : "▶ Resume";
  }

  function resetPlaybackStage() {
    elements["playback-position"].textContent = "Choose a prompt dataset, then press Play outputs.";
    elements["playback-tokens"].replaceChildren(
      el("span", "playback-empty", "The retained continuation will appear here one token at a time."),
    );
  }

  function resetPlayback(scroll=false) {
    stopPlayback();
    playback.index = 0;
    for (const node of new Set(playbackNodes.values())) node.branchUI?.reset();
    resetPlaybackStage();
    elements.play.textContent = "▶ Play outputs";
    elements.status.textContent = `Ready · ${playbackStates.length.toLocaleString()} recorded tokens in selection`;
    if (scroll && visibleNodes[0]) visibleNodes[0].scrollIntoView({behavior:"smooth",block:"center"});
  }

  async function play() {
    if (playback.running) {
      stopPlayback();
      elements.status.textContent = `Paused · ${playback.index}/${playbackStates.length}`;
      return;
    }
    if (playback.index >= playbackStates.length) {
      playback.index = 0;
      resetPlaybackStage();
    }
    if (playback.index === 0) elements["playback-tokens"].replaceChildren();
    playback.running = true;
    playback.epoch += 1;
    const epoch = playback.epoch;
    elements.play.textContent = "❚❚ Pause";
    while (playback.running && epoch === playback.epoch && playback.index < playbackStates.length) {
      if (playback.node) playback.node.classList.remove("playback-current");
      const state = playbackStates[playback.index];
      playback.node = playbackNodes.get(state.index) || null;
      if (playback.node) playback.node.classList.add("playback-current");
      const fork = state.flip ? playback.node?.branchUI : null;
      if (fork && !fork.complete) {
        fork.panel.open = true;
        fork.panel.classList.add("playing");
        fork.panel.classList.toggle("focused", elements["focus-fork"].checked);
        if (elements["focus-fork"].checked) {
          await new Promise((resolve) => window.requestAnimationFrame(
            () => window.requestAnimationFrame(resolve),
          ));
          fork.panel.scrollIntoView({behavior:"auto", block:"center"});
        }
        if (!fork.maximum) {
          fork.complete = true;
        } else {
          const branchDelay = Math.max(7, Math.round(Number(elements.speed.value) * .2));
          while (playback.running && epoch === playback.epoch && fork.cursor < fork.maximum) {
            fork.reveal(fork.cursor + 1);
            elements.status.textContent = `Counterfactual fork at ${state.row.target_position.toLocaleString()} · branch token ${fork.cursor}/${fork.maximum}`;
            await new Promise((resolve) => window.setTimeout(resolve, branchDelay));
          }
          if (!playback.running || epoch !== playback.epoch) break;
          fork.complete = true;
          fork.panel.classList.remove("playing", "focused");
          fork.panel.classList.add("returning");
          elements.status.textContent = `Fork discarded · returning to recorded path at ${state.row.target_position.toLocaleString()}`;
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(240, Number(elements.speed.value))));
          if (!playback.running || epoch !== playback.epoch) break;
        }
      }
      playback.index += 1;
      const position = state.row.target_position;
      const recorded = token(state.row.recorded_token_id);
      const played = el("span", "playback-token", recorded.display);
      played.title = `${position.toLocaleString()} · token ${recorded.id} · ${JSON.stringify(recorded.decoded)}`;
      elements["playback-tokens"].append(played);
      elements["playback-position"].textContent =
        `token ${playback.index.toLocaleString()}/${playbackStates.length.toLocaleString()} · context ${position.toLocaleString()}`;
      elements["playback-tokens"].scrollTop = elements["playback-tokens"].scrollHeight;
      elements.status.textContent = `Recorded token ${playback.index.toLocaleString()}/${playbackStates.length.toLocaleString()} · context ${position.toLocaleString()}`;
      if (playback.node) {
        const bounds = playback.node.getBoundingClientRect();
        if (bounds.top < 320 || bounds.bottom > window.innerHeight - 60) {
          playback.node.scrollIntoView({behavior:"smooth",block:"center"});
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, Number(elements.speed.value)));
    }
    if (playback.running && epoch === playback.epoch) {
      playback.running = false;
      elements.play.textContent = "▶ Replay outputs";
      elements.status.textContent = `Complete · ${playbackStates.length.toLocaleString()} recorded tokens replayed`;
    }
  }

  function render() {
    stopPlayback();
    const states = selectedRangeStates();
    renderSummary(states);
    const filtered = states.filter(eligible);
    playbackStates = filtered;
    const nodes = [];
    const showDividers = elements.range.value === "all";
    if (elements.compact.checked && elements.filter.value === "all") {
      let gap = [];
      let currentRange = null;
      for (const state of filtered) {
        if (state.row.range_index !== currentRange) {
          if (gap.length) nodes.push(gapRow(gap));
          gap = [];
          currentRange = state.row.range_index;
          if (showDividers) nodes.push(outputDivider(currentRange));
        }
        if (state.flip) {
          if (gap.length) nodes.push(gapRow(gap));
          gap = [];
          nodes.push(tokenRow(state));
        } else {
          gap.push(state);
        }
      }
      if (gap.length) nodes.push(gapRow(gap));
    } else {
      let currentRange = null;
      for (const state of filtered) {
        if (showDividers && state.row.range_index !== currentRange) {
          currentRange = state.row.range_index;
          nodes.push(outputDivider(currentRange));
        }
        nodes.push(tokenRow(state));
      }
    }
    elements.stream.replaceChildren(...(
      nodes.length ? nodes : [el("div", "empty", "No rows match this filter.")]
    ));
    visibleNodes = [...elements.stream.querySelectorAll(".token-row,.playback-node")];
    playbackNodes = new Map(visibleNodes.map((node) => [
      Number(node.dataset.playbackIndex), node,
    ]));
    playback.index = 0;
    resetPlaybackStage();
    elements.status.textContent = `Ready · ${filtered.length.toLocaleString()} visible recorded tokens`;
    const allOutputs = elements.range.value === "all";
    const range = allOutputs ? null : dataset.ranges[Number(elements.range.value)];
    const base = caseFor(baselineId);
    elements["method-note"].innerHTML = [
      allOutputs
        ? `<strong>All ${dataset.ranges.length} retained outputs</strong>`
        : `<strong>${range?.candidate_id || `Output ${elements.range.value}`}</strong>`,
      allOutputs
        ? "Output boundaries are marked in the stream; playback proceeds through them in recorded order."
        : range?.description,
      !allOutputs && range?.expected_output && `Expected: ${range.expected_output}.`,
      `Baseline: ${base.label}.`,
      catalog.tie_rules?.[elements["tie-rule"].value],
      dataset.method,
    ].filter(Boolean).join(" ");
    if (states.length && !allOutputs) {
      const route = recordedRouteNode(states[0]);
      route.classList.add("range-route");
      elements["method-note"].append(route);
    }
  }

  function jump(direction) {
    const flips = [...document.querySelectorAll('.token-row[data-flip="1"]')];
    if (!flips.length) return;
    const boundary = window.scrollY + 300;
    const target = direction > 0
      ? flips.find((node) => node.offsetTop > boundary)
      : [...flips].reverse().find((node) => node.offsetTop < boundary);
    (target || flips[direction > 0 ? 0 : flips.length - 1]).scrollIntoView({behavior:"smooth",block:"center"});
  }

  function exportRows() {
    const states = selectedRangeStates().filter(eligible);
    return states.map((state) => ({
      source_position:state.row.source_position,
      target_position:state.row.target_position,
      recorded_token_id:state.row.recorded_token_id,
      recorded_token:token(state.row.recorded_token_id).decoded,
      distinct_winners:state.distinct,
      predictions:Object.fromEntries(state.predictions.map((item) => [item.case_id, {
        top1_token_id:item.top1_token_id,
        top1_token:token(item.top1_token_id).decoded,
        top1_probability:item.probability,
        top1_margin:item.margin,
        recorded_rank:item.recorded_rank,
        matches_baseline:item.top1_token_id === state.base.top1_token_id,
        matches_recorded:item.recorded_match,
      }])),
    }));
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
  }

  function exportCsv() {
    const fields = [
      "source_position","target_position","recorded_token_id","recorded_token",
      "case_id","case_label","is_baseline","top1_token_id","top1_token",
      "top1_probability","top1_margin","recorded_rank","matches_baseline","matches_recorded",
    ];
    const rows = [];
    for (const row of exportRows()) {
      for (const [caseId,prediction] of Object.entries(row.predictions)) {
        rows.push({
          source_position:row.source_position,
          target_position:row.target_position,
          recorded_token_id:row.recorded_token_id,
          recorded_token:row.recorded_token,
          case_id:caseId,
          case_label:caseFor(caseId).label,
          is_baseline:caseId === baselineId,
          ...prediction,
        });
      }
    }
    return [fields.join(","), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(","))].join("\n") + "\n";
  }

  async function switchBaseline(next) {
    if (next === baselineId) return;
    const previous = baselineId;
    baselineId = next;
    elements.baseline.value = next;
    renderBaselineCards();
    const allowed = new Set(comparisonEntries().map((item) => item.case_id));
    comparisonIds = comparisonIds.filter((id) => id !== next && allowed.has(id));
    if (allowed.has(previous) && !comparisonIds.includes(previous) && comparisonIds.length < maxComparisons) {
      comparisonIds.unshift(previous);
    }
    if (!comparisonIds.length) {
      comparisonIds = comparisonEntries().slice(0,Math.min(3,maxComparisons))
        .map((item) => item.case_id);
    }
    elements.status.textContent = `Loading baseline ${caseFor(next).short_label || caseFor(next).label}…`;
    await Promise.all(activeIds().map(loadRun));
    syncHash();
    populateFilters();
    renderPicker();
    renderBaselineCards();
    renderLegend();
    render();
  }

  function populateFilters() {
    const allowed = new Set([baselineId, ...comparisonEntries().map((item) => item.case_id)]);
    const cases = casesForDataset().filter((item) => allowed.has(item.id));
    const hardware = unique(cases.map((item) => item.hardware).filter(Boolean)).sort();
    const interventions = unique(cases.map((item) => item.intervention).filter(Boolean)).sort();
    const existingHardware = elements["hardware-filter"].value;
    const existingIntervention = elements["intervention-filter"].value;
    elements["hardware-filter"].replaceChildren(
      new Option("All hardware", ""), ...hardware.map((item) => new Option(item,item)),
    );
    elements["intervention-filter"].replaceChildren(
      new Option("All changes", ""), ...interventions.map((item) => new Option(item,item)),
    );
    elements["hardware-filter"].value = hardware.includes(existingHardware) ? existingHardware : "";
    elements["intervention-filter"].value = interventions.includes(existingIntervention) ? existingIntervention : "";
  }

  async function selectDataset(id, preserve=false) {
    datasetMeta = byDataset.get(id) || catalog.datasets[0];
    elements.status.textContent = `Loading ${datasetMeta.label}…`;
    await loadScript(datasetMeta.core);
    dataset = window.QWENFIGHT_DATASETS[datasetMeta.id];
    if (!dataset) throw new Error(`Dataset core did not register ${datasetMeta.id}`);
    const available = new Set(datasetMeta.cases);
    const requestedBaseline = preserve ? baselineId : params.get("baseline");
    baselineId = available.has(requestedBaseline) && baselineIds.has(requestedBaseline)
      ? requestedBaseline
      : datasetMeta.default_baseline;
    const allowedComparisons = new Set(comparisonEntries().map((item) => item.case_id));
    const requestedRuns = preserve
      ? comparisonIds
      : (params.get("runs") || "").split(",").filter(Boolean);
    comparisonIds = unique(requestedRuns)
      .filter((caseId) => available.has(caseId) && allowedComparisons.has(caseId) && caseId !== baselineId)
      .slice(0,maxComparisons);
    if (!comparisonIds.length) {
      comparisonIds = (datasetMeta.default_comparisons || datasetMeta.cases)
        .filter((caseId) => allowedComparisons.has(caseId) && caseId !== baselineId)
        .slice(0,Math.min(3,maxComparisons));
    }
    await Promise.all(activeIds().map(loadRun));
    groupedOptions(elements.baseline, baselineCasesForDataset(), baselineId);
    renderBaselineCards();
    elements.range.replaceChildren(
      new Option(`All ${dataset.ranges.length} retained outputs`, "all"),
      ...dataset.ranges.map((item,index) => new Option(
        `${item.candidate_id || `output ${index + 1}`} · ${Number(item.target_position_start || 0).toLocaleString()} · ${item.rows.toLocaleString()} tokens`,
        String(index),
      )),
    );
    const requestedRange = preserve ? elements.range.value : params.get("range");
    elements.range.value = requestedRange === "all" || requestedRange === null
      ? "all"
      : (dataset.ranges[Number(requestedRange)] ? String(requestedRange) : "all");
    if (!preserve && catalog.tie_rules?.[params.get("ties")]) {
      elements["tie-rule"].value = params.get("ties");
    }
    populateFilters();
    renderPicker();
    renderLegend();
    syncHash();
    render();
  }

  elements["page-title"].textContent = catalog.title;
  document.title = catalog.title;
  if (catalog.subtitle) elements.subtitle.textContent = catalog.subtitle;
  elements["privacy-note"].textContent = catalog.privacy || "";
  elements.dataset.replaceChildren(...catalog.datasets.map((item) => new Option(item.label,item.id)));
  const requestedDataset = params.get("dataset");
  const defaultDataset = byDataset.has(catalog.default_dataset)
    ? catalog.default_dataset
    : catalog.datasets[0].id;
  elements.dataset.value = byDataset.has(requestedDataset) ? requestedDataset : defaultDataset;

  elements.dataset.addEventListener("change", async () => {
    await selectDataset(elements.dataset.value, true);
  });
  elements.baseline.addEventListener("change", () => switchBaseline(elements.baseline.value));
  elements.range.addEventListener("change", () => { syncHash(); render(); });
  elements.filter.addEventListener("change", render);
  elements["tie-rule"].addEventListener("change", () => { syncHash(); render(); });
  elements.compact.addEventListener("change", render);
  elements["focus-fork"].addEventListener("change", () => {
    const panel = document.querySelector(".fork-panel.playing");
    if (!panel) return;
    panel.classList.toggle("focused", elements["focus-fork"].checked);
    if (elements["focus-fork"].checked) {
      panel.scrollIntoView({behavior:"auto",block:"center"});
    }
  });
  elements.play.addEventListener("click", play);
  elements.reset.addEventListener("click", () => resetPlayback(true));
  elements.previous.addEventListener("click", () => jump(-1));
  elements.next.addEventListener("click", () => jump(1));
  for (const id of ["scenario-search","hardware-filter","intervention-filter"]) {
    elements[id].addEventListener(id === "scenario-search" ? "input" : "change", renderPicker);
  }
  elements["copy-link"].addEventListener("click", async () => {
    syncHash();
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const input = document.createElement("textarea");
      input.value = window.location.href;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    elements["copy-link"].textContent = "Link copied ✓";
    window.setTimeout(() => { elements["copy-link"].textContent = "Copy link"; }, 1500);
  });
  elements["export-json"].addEventListener("click", () => download(
    `qwenfight-${datasetMeta.id}-${slug(baselineId)}.json`,
    JSON.stringify({
      schema_version:1,
      dataset:datasetMeta.id,
      baseline:baselineId,
      comparisons:comparisonIds,
      range:elements.range.value === "all" ? "all" : Number(elements.range.value),
      tie_rule:elements["tie-rule"].value,
      rows:exportRows(),
    },null,2) + "\n",
    "application/json",
  ));
  elements["export-csv"].addEventListener("click", () => download(
    `qwenfight-${datasetMeta.id}-${slug(baselineId)}.csv`,
    exportCsv(),
    "text/csv",
  ));

  selectDataset(elements.dataset.value).catch((error) => {
    elements.status.textContent = error.message;
    console.error(error);
  });
})();
