const ACCENT_KEY = "training-tracker-accent";
const WIDGET_STYLE_KEY = "training-tracker-widget-style";
const ACCENT_COLORS = [
  { id: "lime", color: "#c8f135", label: "Лайм" },
  { id: "cyan", color: "#2fd3f0", label: "Циан" },
  { id: "coral", color: "#ff5a5f", label: "Коралл" },
  { id: "violet", color: "#a78bfa", label: "Фиолет" },
  { id: "amber", color: "#ffb454", label: "Янтарь" },
];

function currentAccent() {
  const saved = localStorage.getItem(ACCENT_KEY);
  return ACCENT_COLORS.some((accent) => accent.id === saved) ? saved : "lime";
}

function applyAccent(accentId) {
  if (accentId === "lime") {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accentId;
  }
  localStorage.setItem(ACCENT_KEY, accentId);
  renderAccentPicker();
  updateNativeWidget();
}

function currentWidgetStyle() {
  return localStorage.getItem(WIDGET_STYLE_KEY) === "glass" ? "glass" : "solid";
}

function setWidgetStyle(style) {
  localStorage.setItem(WIDGET_STYLE_KEY, style === "glass" ? "glass" : "solid");
  renderWidgetStylePicker();
  updateNativeWidget();
  showToast(style === "glass" ? "Виджеты стали прозрачными" : "Виджеты с плотным фоном");
}

function renderWidgetStylePicker() {
  const active = currentWidgetStyle();
  document.querySelectorAll("[data-widget-style]").forEach((button) => {
    const isActive = button.dataset.widgetStyle === active;
    button.classList.toggle("secondary", isActive);
    button.classList.toggle("ghost", !isActive);
    button.setAttribute("aria-checked", String(isActive));
  });
}

function renderAccentPicker() {
  if (!elements.accentPicker) return;
  const active = currentAccent();
  elements.accentPicker.innerHTML = "";
  ACCENT_COLORS.forEach((accent) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `accent-dot${accent.id === active ? " is-active" : ""}`;
    dot.style.background = accent.color;
    dot.title = accent.label;
    dot.setAttribute("role", "radio");
    dot.setAttribute("aria-checked", String(accent.id === active));
    dot.setAttribute("aria-label", `Акцент: ${accent.label}`);
    dot.addEventListener("click", () => applyAccent(accent.id));
    elements.accentPicker.append(dot);
  });
}
