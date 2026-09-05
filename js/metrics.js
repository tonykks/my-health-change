(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HealthMetrics = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PERIODS = [7, 30, 90];
  const CHART_METRICS = {
    weight: {
      id: "weight",
      label: "체중",
      title: "체중 추세",
      unit: "kg",
      digits: 1,
      series: [{ key: "weightKg", label: "체중", color: "#1c6b66" }],
    },
    bp: {
      id: "bp",
      label: "혈압",
      title: "혈압 추세",
      unit: "mmHg",
      digits: 0,
      series: [
        { key: "sbp", label: "수축기", color: "#1c6b66" },
        { key: "dbp", label: "이완기", color: "#c46b3a" },
      ],
    },
    steps: {
      id: "steps",
      label: "걸음수",
      title: "걸음수 추세",
      unit: "걸음",
      digits: 0,
      series: [{ key: "steps", label: "걸음수", color: "#1c6b66" }],
    },
    exercise: {
      id: "exercise",
      label: "운동시간",
      title: "운동시간 추세",
      unit: "분",
      digits: 0,
      series: [{ key: "exerciseMin", label: "운동시간", color: "#1c6b66" }],
    },
  };
  const DEFAULT_CHART_METRIC = "steps";

  function parseISO(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function addDays(date, amount) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function mean(values) {
    if (!values.length) return null;
    return values.reduce(function (sum, value) {
      return sum + value;
    }, 0) / values.length;
  }

  function round(value, digits) {
    if (value == null || Number.isNaN(value)) return null;
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  }

  function latestDate(records) {
    if (!records.length) return null;
    return records
      .map(function (row) {
        return row.date;
      })
      .sort()
      .slice(-1)[0];
  }

  function windowRecords(records, endDateStr, days) {
    if (!endDateStr || !days) return [];
    const end = parseISO(endDateStr);
    const start = addDays(end, -(days - 1));
    return records
      .filter(function (row) {
        const date = parseISO(row.date);
        return date >= start && date <= end;
      })
      .sort(function (a, b) {
        return a.date.localeCompare(b.date);
      });
  }

  function previousEndDate(endDateStr, days) {
    return formatISO(addDays(parseISO(endDateStr), -days));
  }

  function direction(current, previous, absThreshold, percentThreshold) {
    if (current == null || previous == null) return "유지";
    const delta = current - previous;
    const percent = previous === 0 ? 0 : Math.abs(delta / previous);
    if (Math.abs(delta) < absThreshold && percent < percentThreshold) return "유지";
    return delta > 0 ? "증가" : "감소";
  }

  function changeText(label, dir, subjectParticle) {
    const particle = subjectParticle || "가";
    if (dir === "증가") return label + particle + " 이전 기간보다 증가했습니다.";
    if (dir === "감소") return label + particle + " 이전 기간보다 감소했습니다.";
    return label + "는 큰 변화 없이 유지되었습니다.";
  }

  function buildMetric(label, unit, current, previous, absThreshold, percentThreshold, digits) {
    const dir = direction(current, previous, absThreshold, percentThreshold);
    const delta = current != null && previous != null ? current - previous : null;
    return {
      label: label,
      unit: unit,
      current: round(current, digits),
      previous: round(previous, digits),
      delta: round(delta, digits),
      direction: dir,
    };
  }

  function forbiddenPhrase(text) {
    return /진단|치료|처방|약\s|약물|질병|건강이 좋아|건강이 나빠|위험|병원/.test(text);
  }

  function formatYTick(value, digits, unit) {
    if (digits === 1) return Number(value).toFixed(1);
    const rounded = Math.round(value);
    if (unit === "걸음") return rounded.toLocaleString("ko-KR");
    return String(rounded);
  }

  function buildYAxis(values, digits, unit) {
    if (!values.length) {
      return { min: 0, max: 1, ticks: [] };
    }
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (min === max) {
      const pad = digits === 1 ? 0.4 : unit === "걸음" ? 200 : 4;
      min -= pad;
      max += pad;
    } else if (digits === 1 && (max - min) / 4 < 0.1) {
      const mid = (min + max) / 2;
      min = mid - 0.2;
      max = mid + 0.2;
    }
    const ticks = [];
    for (let i = 0; i < 5; i += 1) {
      const value = min + ((max - min) * i) / 4;
      ticks.push({
        value: value,
        label: formatYTick(value, digits, unit),
      });
    }
    return { min: min, max: max, ticks: ticks };
  }

  function buildChart(rows, chartMetricId) {
    const spec = CHART_METRICS[chartMetricId] || CHART_METRICS[DEFAULT_CHART_METRIC];
    const series = spec.series.map(function (item) {
      return {
        key: item.key,
        label: item.label,
        color: item.color,
        points: rows.map(function (row) {
          return { date: row.date, value: row[item.key] };
        }),
      };
    });
    const lineNames = series.map(function (item) {
      return item.label;
    }).join(", ");
    const allValues = series.reduce(function (list, item) {
      return list.concat(item.points.map(function (point) {
        return point.value;
      }));
    }, []);
    return {
      metricId: spec.id,
      title: spec.title,
      unit: spec.unit,
      digits: spec.digits,
      description: "선택한 기간의 " + spec.title + ". 단위 " + spec.unit + ". 선: " + lineNames + ". 점 " + (series[0] ? series[0].points.length : 0) + "개",
      series: series,
      points: series[0] ? series[0].points : [],
      yAxis: buildYAxis(allValues, spec.digits, spec.unit),
    };
  }

  function buildDashboard(payload, periodDays, chartMetricId) {
    const records = (payload && payload.records) || [];
    const meta = (payload && payload.meta) || {};
    const period = PERIODS.indexOf(periodDays) >= 0 ? periodDays : 30;
    const end = latestDate(records);
    const currentRows = windowRecords(records, end, period);
    const previousRows = end ? windowRecords(records, previousEndDate(end, period), period) : [];

    const weight = buildMetric(
      "체중",
      "kg",
      mean(currentRows.map(function (row) { return row.weightKg; })),
      mean(previousRows.map(function (row) { return row.weightKg; })),
      0.3,
      0.005,
      1
    );
    const sbp = buildMetric(
      "수축기 혈압",
      "mmHg",
      mean(currentRows.map(function (row) { return row.sbp; })),
      mean(previousRows.map(function (row) { return row.sbp; })),
      3,
      0.02,
      0
    );
    const dbp = buildMetric(
      "이완기 혈압",
      "mmHg",
      mean(currentRows.map(function (row) { return row.dbp; })),
      mean(previousRows.map(function (row) { return row.dbp; })),
      3,
      0.03,
      0
    );
    const steps = buildMetric(
      "평균 걸음수",
      "걸음",
      mean(currentRows.map(function (row) { return row.steps; })),
      mean(previousRows.map(function (row) { return row.steps; })),
      200,
      0.05,
      0
    );
    const exercise = buildMetric(
      "평균 운동시간",
      "분",
      mean(currentRows.map(function (row) { return row.exerciseMin; })),
      mean(previousRows.map(function (row) { return row.exerciseMin; })),
      5,
      0.08,
      0
    );

    const bpDirection = sbp.direction === "유지" ? dbp.direction : sbp.direction;
    const headline = steps.direction !== "유지"
      ? "최근 " + period + "일 기록에서 평균 걸음수가 이전 기간보다 " + steps.direction + "했습니다."
      : weight.direction !== "유지"
        ? "최근 " + period + "일 기록에서 체중은 완만한 " + weight.direction + " 추세를 보였습니다."
        : bpDirection === "유지"
          ? "최근 " + period + "일 기록에서 혈압 기록은 큰 변화 없이 유지되었습니다."
          : "최근 " + period + "일 기록에서 혈압 기록이 이전 기간보다 " + bpDirection + "했습니다.";

    const summaries = [
      changeText("평균 걸음수", steps.direction, "가"),
      weight.direction === "감소"
        ? "체중은 완만한 감소 추세를 보였습니다."
        : changeText("체중", weight.direction, "이"),
      bpDirection === "유지"
        ? "혈압 기록은 큰 변화 없이 유지되었습니다."
        : "혈압 기록이 이전 기간보다 " + bpDirection + "했습니다.",
      changeText("평균 운동시간", exercise.direction, "이"),
    ];

    const watchItems = [weight, steps, exercise].filter(function (metric) {
      return metric.direction === "유지";
    }).map(function (metric) {
      return metric.label + " 기록은 이전 기간과 비슷하게 유지되었습니다.";
    });
    if (bpDirection === "유지") {
      watchItems.unshift("혈압 기록은 큰 변화 없이 유지되었습니다.");
    }

    const continueItems = [steps, exercise, weight].filter(function (metric) {
      return metric.direction !== "유지";
    }).map(function (metric) {
      return metric.label + " 기록의 " + metric.direction + " 흐름을 같은 방식으로 계속 살펴볼 수 있습니다.";
    });

    const allText = [headline].concat(summaries, watchItems, continueItems).join(" ");
    if (forbiddenPhrase(allText)) {
      throw new Error("Summary contains forbidden medical language");
    }

    return {
      periodDays: period,
      endDate: end,
      currentCount: currentRows.length,
      previousCount: previousRows.length,
      sampleNote: meta.note || "실제 개인 건강정보가 아닙니다.",
      sampleLabel: meta.label || "Demo용 Sample Data",
      headline: headline,
      summaries: summaries,
      watchItems: watchItems.length ? watchItems : ["모든 핵심 지표에서 뚜렷한 증감 없이 기록이 이어졌습니다."],
      continueItems: continueItems.length ? continueItems : ["같은 기간 비교로 기록 변화를 계속 확인할 수 있습니다."],
      metrics: {
        weight: weight,
        sbp: sbp,
        dbp: dbp,
        steps: steps,
        exercise: exercise,
      },
      chart: buildChart(currentRows, chartMetricId),
    };
  }

  return {
    PERIODS: PERIODS,
    CHART_METRICS: CHART_METRICS,
    DEFAULT_CHART_METRIC: DEFAULT_CHART_METRIC,
    parseISO: parseISO,
    formatISO: formatISO,
    windowRecords: windowRecords,
    latestDate: latestDate,
    mean: mean,
    direction: direction,
    buildYAxis: buildYAxis,
    formatYTick: formatYTick,
    buildChart: buildChart,
    buildDashboard: buildDashboard,
    forbiddenPhrase: forbiddenPhrase,
  };
});
