(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // --- Service content -----------------------------------------------------
  // Connect copy comes from the original page; Source/Deliver copy is drafted
  // from the FAQ wording and should be reviewed.
  const SERVICES = {
    connect: {
      tag: "THE RIGHT CONNECTION",
      title: "A good introduction.<br>A confident next step.",
      description:
        "For buyers ready to manage the relationship themselves. We match your requirements with a suitable supplier, then make the introduction.",
      cta: "Prepare a Connect RFQ",
      steps: [
        ["Share your requirements", "Product, specification, quantity, and timing."],
        ["We find the fit", "Supplier matching and an agreed introduction scope."],
        ["Your introduction", "Supplier details shared after the agreed fee is paid."],
      ],
      note: "You take over the supplier relationship and shipping.",
      commercial: "A defined introduction fee, agreed before we begin.",
      formNote: "Supplier details are shared after the agreed introduction fee is paid.",
    },
    source: {
      tag: "THE RIGHT SUPPLY",
      title: "We find it. We negotiate it.<br>We supply it.",
      description:
        "For buyers who want Taotus to manage sourcing and supply the goods under one quotation, while you arrange shipping.",
      cta: "Prepare a Source RFQ",
      steps: [
        ["Share your requirements", "Product, specification, quantity, and timing."],
        ["We source and negotiate", "Supplier selection, samples, and checks agreed in scope."],
        ["Goods ready for collection", "You arrange shipping from the agreed collection point."],
      ],
      note: "Taotus is your commercial counterpart. Supplier identities stay confidential.",
      commercial: "Quoted for your requirement, with terms agreed before you commit.",
      formNote: "Quoted for your specific requirement. Supplier identities stay confidential.",
    },
    deliver: {
      tag: "THE RIGHT FINISH",
      title: "From supplier<br>to your door.",
      description:
        "For buyers who want sourcing and delivery coordinated end to end, to an agreed destination.",
      cta: "Prepare a Deliver RFQ",
      steps: [
        ["Share your requirements", "Product, specification, quantity, destination, and timing."],
        ["We source and coordinate", "Sourcing plus logistics, documents, and delivery terms."],
        ["Delivery to your destination", "Handoff at the door, as agreed in the quotation."],
      ],
      note: "Taotus coordinates door-to-door logistics. Duties and clearance are agreed upfront.",
      commercial: "Quoted for your requirement, including delivery terms agreed before an order.",
      formNote: "Quoted for your specific requirement, including delivery coordination.",
    },
  };

  const SERVICE_LABELS = {
    connect: "Connect — supplier introduction",
    source: "Source — sourcing, I arrange shipping",
    deliver: "Deliver — sourcing and delivery coordination",
    unsure: "Help me choose",
  };

  // --- Theme ---------------------------------------------------------------
  const root = document.documentElement;
  const themeToggle = $("#theme-toggle");
  const themeMeta = $('meta[name="theme-color"]');
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");

  const isDark = () => (root.dataset.theme ? root.dataset.theme === "dark" : darkQuery.matches);

  function syncTheme() {
    const dark = isDark();
    themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    themeMeta.content = dark ? "#0f1f1a" : "#173e35";
    // The icon CSS keys off data-theme, so pin it when following the OS.
    if (!root.dataset.theme) root.dataset.theme = dark ? "dark" : "light";
  }

  themeToggle.addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
    syncTheme();
  });
  syncTheme();

  // --- Mobile menu ---------------------------------------------------------
  const menuButton = $(".menu-button");
  const mobileNav = $("#mobile-menu");

  function setMenu(open) {
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileNav.hidden = !open;
  }
  menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
  mobileNav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // --- Service tabs --------------------------------------------------------
  const tabs = $$('[role="tab"]');
  const panel = $("#service-panel");
  const rfqService = $("#rfq-service");
  const formServiceNote = $("#form-service-note");

  function renderService(key) {
    const s = SERVICES[key];
    $("#service-tag").textContent = s.tag;
    $("#service-title").innerHTML = s.title;
    $("#service-description").textContent = s.description;
    $("#service-cta").innerHTML = `${s.cta} <span aria-hidden="true">↗</span>`;
    $("#route-list").innerHTML = s.steps
      .map(([title, detail], i) => {
        const cls = i === s.steps.length - 1 ? ' class="handoff"' : "";
        return `<li${cls}><span>0${i + 1}</span><div><strong>${title}</strong><small>${detail}</small></div></li>`;
      })
      .join("");
    $("#route-count").textContent = `0${tabs.findIndex((t) => t.dataset.service === key) + 1} / 03`;
    $("#route-note span").textContent = s.note;
    $("#commercial-note").textContent = s.commercial;
  }

  function selectTab(tab, { focus = false } = {}) {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", tab.id);
    renderService(tab.dataset.service);
    // Keep the RFQ form in step with the chosen path.
    rfqService.value = tab.dataset.service;
    syncFormNote();
    if (focus) tab.focus();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      const moves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (e.key in moves) {
        e.preventDefault();
        selectTab(tabs[(i + moves[e.key] + tabs.length) % tabs.length], { focus: true });
      } else if (e.key === "Home") {
        e.preventDefault();
        selectTab(tabs[0], { focus: true });
      } else if (e.key === "End") {
        e.preventDefault();
        selectTab(tabs[tabs.length - 1], { focus: true });
      }
    });
  });

  function syncFormNote() {
    const s = SERVICES[rfqService.value];
    formServiceNote.textContent = s
      ? s.formNote
      : "Not sure yet? Describe your requirement and we will recommend a path.";
  }
  rfqService.addEventListener("change", () => {
    const tab = tabs.find((t) => t.dataset.service === rfqService.value);
    if (tab) selectTab(tab);
    else syncFormNote();
  });

  // Nav CTAs that carry a service pre-select the form.
  $("#service-cta").addEventListener("click", () => {
    rfqService.value = $('[role="tab"][aria-selected="true"]').dataset.service;
    syncFormNote();
  });

  // --- RFQ draft -----------------------------------------------------------
  const form = $("#rfq-form");
  const rfqDialog = $("#rfq-dialog");
  const rfqOutput = $("#rfq-output");
  const copyStatus = $("#copy-status");

  function buildBrief(data) {
    const line = (label, value) => `${label}: ${value && value.trim() ? value.trim() : "—"}`;
    return [
      "TAOTUS — SOURCING BRIEF (DRAFT)",
      `Prepared: ${new Date().toISOString().slice(0, 10)}`,
      "",
      line("Level of support", SERVICE_LABELS[data.get("service")]),
      line("Product or material", data.get("product")),
      line("Quantity & unit", data.get("quantity")),
      line("Destination", data.get("destination")),
      line("Target timing", data.get("timing")),
      line("Indicative budget", data.get("budget")),
      "",
      "Specifications & requirements:",
      data.get("specifications").trim(),
      "",
      "Contact",
      line("Name", data.get("name")),
      line("Company", data.get("company")),
      line("Email", data.get("email")),
      "",
      "This is a draft prepared in the browser. It has not been sent to Taotus.",
    ].join("\n");
  }

  const sendButton = $("#send-rfq");
  const sendButtonLabel = sendButton.innerHTML;
  const sendStatus = $("#send-status");
  const sendStatusText = $("#send-status-text");
  let pendingBrief = null;

  function setSendStatus(state, text) {
    sendStatus.dataset.state = state;
    sendStatusText.textContent = text;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    pendingBrief = Object.fromEntries(data);
    rfqOutput.textContent = buildBrief(data);
    copyStatus.textContent = "";
    sendButton.disabled = false;
    sendButton.innerHTML = sendButtonLabel;
    setSendStatus("draft", "Draft only — this RFQ has not been sent to Taotus.");
    rfqDialog.showModal();
  });

  sendButton.addEventListener("click", async () => {
    sendButton.disabled = true;
    setSendStatus("sending", "Sending…");
    try {
      const res = await fetch("/api/rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingBrief),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sendButton.textContent = "Sent";
      setSendStatus("sent", `Sent. Taotus will reply to ${pendingBrief.email}.`);
      form.reset();
      selectTab($('[role="tab"][aria-selected="true"]'));
    } catch {
      sendButton.disabled = false;
      setSendStatus(
        "error",
        "We couldn’t send this just now. Copy or download your brief and email it to info@taotus.com."
      );
    }
  });

  $("#copy-rfq").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(rfqOutput.textContent);
      copyStatus.textContent = "Copied to your clipboard.";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(rfqOutput);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copyStatus.textContent = "Select and copy the text above (Ctrl/Cmd + C).";
    }
  });

  $("#download-rfq").addEventListener("click", () => {
    const blob = new Blob([rfqOutput.textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "taotus-rfq.txt" });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    copyStatus.textContent = "Downloaded taotus-rfq.txt.";
  });

  // --- Dialogs -------------------------------------------------------------
  $("#privacy-open").addEventListener("click", () => $("#privacy-dialog").showModal());
  $$("dialog").forEach((dialog) => {
    $$(".close-dialog, .edit-brief", dialog).forEach((btn) =>
      btn.addEventListener("click", () => dialog.close())
    );
    // Click on the backdrop closes the dialog.
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  });

  // --- Init ----------------------------------------------------------------
  $("#year").textContent = new Date().getFullYear();
  selectTab(tabs[0]);
})();
