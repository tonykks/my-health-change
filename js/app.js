(function () {
  const DATA_URL = "./data/sample-health.json";
  const periodButtons = Array.prototype.slice.call(document.querySelectorAll("[data-period]"));
  const metricButtons = Array.prototype.slice.call(document.querySelectorAll("[data-metric]"));
  const headline = document.getElementById("headline");
  const changeList = document.getElementById("change-list");
  const watchList = document.getElementById("watch-list");
  const errorBox = document.getElementById("error");
  const chart = document.getElementById("trend-chart");
  const chartHeading = document.getElementById("chart-heading");
  const chartDesc = document.getElementById("chart-desc");
  const chartLegend = document.getElementById("chart-legend");
  let payload = null;
  let currentPeriod = 30;
  let currentMetric = "steps";

  function showError(message) {
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  function signed(value, digits, unit) {
    if (value == null) return "비교할 이전 기간 기록이 부족합니다";
    const rounded = digits === 0 ? Math.round(value) : Number(value).toFixed(digits);
    const prefix = value > 0 ? "+" : "";
    return "이전 기간 대비 " + prefix + rounded + " " + unit;
  }

  function fillList(node, items) {
    node.textContent = "";
    items.forEach(function (text) {
      const item = document.createElement("li");
      item.textContent = text;
      node.appendChild(item);
    });
  }

  function setCard(id, valueText, deltaText) {
    const card = document.getElementById(id);
    card.querySelector('[data-role="value"]').textContent = valueText;
    card.querySelector('[data-role="delta"]').textContent = deltaText;
  }

  function formatTick(value, digits) {
    if (digits === 1) return Number(value).toFixed(1);
    return String(Math.round(value));
  }

  function svgEl(name, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function drawChart(chartView) {
    const width = 360;
    const height = 220;
    const pad = { top: 28, right: 12, bottom: 36, left: 48 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const series = chartView.series || [];
    while (chart.firstChild) chart.removeChild(chart.firstChild);

    const allPoints = series.reduce(function (list, item) {
      return list.concat(item.points || []);
    }, []);

    if (!allPoints.length) {
      chart.appendChild(svgEl("text", { x: "24", y: "110" }));
      chart.lastChild.textContent = "표시할 기록이 없습니다.";
      chartLegend.hidden = true;
      chartLegend.textContent = "";
      return;
    }

    const values = allPoints.map(function (point) { return point.value; });
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    const span = Math.max(chartView.digits === 1 ? 0.1 : 1, max - min);
    const xCount = series[0].points.length;
    const xAt = function (index) {
      if (xCount === 1) return pad.left + innerW / 2;
      return pad.left + (index / (xCount - 1)) * innerW;
    };
    const yAt = function (value) {
      return pad.top + innerH - ((value - min) / span) * innerH;
    };

    chart.appendChild(svgEl("polyline", {
      fill: "none",
      stroke: "#d7cfc2",
      "stroke-width": "1",
      points: pad.left + "," + (pad.top + innerH) + " " + (pad.left + innerW) + "," + (pad.top + innerH),
    }));

    series.forEach(function (item) {
      const d = item.points.map(function (point, index) {
        return (index === 0 ? "M" : "L") + xAt(index) + " " + yAt(point.value);
      }).join(" ");
      chart.appendChild(svgEl("path", {
        d: d,
        fill: "none",
        stroke: item.color,
        "stroke-width": "3",
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      }));
    });

    const firstPoint = series[0].points[0];
    const lastPoint = series[0].points[series[0].points.length - 1];
    const first = svgEl("text", { class: "chart-label", x: String(pad.left), y: String(height - 10) });
    first.textContent = firstPoint.date.slice(5);
    chart.appendChild(first);
    const last = svgEl("text", {
      class: "chart-label",
      x: String(width - pad.right),
      y: String(height - 10),
      "text-anchor": "end",
    });
    last.textContent = lastPoint.date.slice(5);
    chart.appendChild(last);

    const unitLabel = svgEl("text", { class: "chart-label", x: "8", y: "16" });
    unitLabel.textContent = chartView.unit;
    chart.appendChild(unitLabel);
    const maxLabel = svgEl("text", { class: "chart-label", x: "8", y: String(pad.top + 6) });
    maxLabel.textContent = formatTick(max, chartView.digits);
    chart.appendChild(maxLabel);

    if (series.length > 1) {
      chartLegend.hidden = false;
      chartLegend.textContent = series.map(function (item) {
        return item.label;
      }).join(" / ") + " · 단위 " + chartView.unit;
    } else {
      chartLegend.hidden = false;
      chartLegend.textContent = "단위 " + chartView.unit;
    }
  }

  function render() {
    const view = window.HealthMetrics.buildDashboard(payload, currentPeriod, currentMetric);
    headline.textContent = view.headline;
    setCard(
      "card-weight",
      view.metrics.weight.current == null ? "기록 없음" : view.metrics.weight.current + " kg",
      view.metrics.weight.direction + " · " + signed(view.metrics.weight.delta, 1, "kg")
    );
    setCard(
      "card-bp",
      view.metrics.sbp.current == null ? "기록 없음" : view.metrics.sbp.current + " / " + view.metrics.dbp.current,
      "수축기 " + view.metrics.sbp.direction + " · 이완기 " + view.metrics.dbp.direction
    );
    setCard(
      "card-steps",
      view.metrics.steps.current == null ? "기록 없음" : Math.round(view.metrics.steps.current).toLocaleString("ko-KR") + " 걸음",
      view.metrics.steps.direction + " · " + signed(view.metrics.steps.delta, 0, "걸음")
    );
    setCard(
      "card-exercise",
      view.metrics.exercise.current == null ? "기록 없음" : view.metrics.exercise.current + " 분",
      view.metrics.exercise.direction + " · " + signed(view.metrics.exercise.delta, 0, "분")
    );
    fillList(changeList, view.summaries);
    fillList(watchList, view.watchItems.concat(view.continueItems));
    chartHeading.textContent = view.chart.title;
    chartDesc.textContent = "최근 " + view.periodDays + "일 " + view.chart.description;
    drawChart(view.chart);
  }

  function selectPeriod(periodDays) {
    currentPeriod = periodDays;
    periodButtons.forEach(function (button) {
      const pressed = Number(button.getAttribute("data-period")) === periodDays;
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
    render();
  }

  function selectMetric(metricId) {
    currentMetric = metricId;
    metricButtons.forEach(function (button) {
      const pressed = button.getAttribute("data-metric") === metricId;
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
    render();
  }

  periodButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      selectPeriod(Number(button.getAttribute("data-period")));
    });
  });

  metricButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      selectMetric(button.getAttribute("data-metric"));
    });
  });

  fetch(DATA_URL)
    .then(function (response) {
      if (!response.ok) throw new Error("Sample Data를 읽지 못했습니다.");
      return response.json();
    })
    .then(function (data) {
      payload = data;
      selectPeriod(currentPeriod);
    })
    .catch(function () {
      showError("Sample Data를 불러오려면 로컬 웹 서버로 web 폴더를 열어 주세요. 예: python -m http.server 4173");
    });
})();
