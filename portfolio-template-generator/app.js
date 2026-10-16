/* Portfolia — browser-side portfolio builder.
   Data access is protected by Supabase Auth + Row Level Security (see schema.sql). */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const config = window.APP_CONFIG || {};
  const configReady = config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("YOUR-PROJECT") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
  let supabase = null;
  let currentUser = null;
  let editingId = null;
  let currentPortfolio = null;
  let deleteTarget = null;
  let uploadedPictureUrl = "";
  let portfoliosCache = [];

  const esc = (value = "") => String(value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const safeUrl = (value = "") => {
    try {
      const url = new URL(value);
      return ["http:","https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  };
  const setStatus = (selector, message, type = "") => {
    const el = $(selector);
    if (!el) return;
    el.textContent = message;
    el.className = `status-message ${type}`;
  };
  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
  }
  function showPage(name) {
    const page = name === "templates" ? "templates" : name;
    $$(".page").forEach(el => el.classList.toggle("active", el.id === `${page}-page`));
    $$(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.page === page || (page === "templates" && el.dataset.page === "templates")));
    window.scrollTo({top:0,behavior:"smooth"});
    if (page === "manage") loadPortfolios();
    if (page === "editor") setStatus("#form-status", "");
  }
  function setupNavigation() {
    $$("[data-page]").forEach(el => el.addEventListener("click", event => {
      event.preventDefault();
      const page = el.dataset.page;
      if (page === "editor" && !editingId) resetForm();
      showPage(page);
    }));
    $$(".choose-template").forEach(button => button.addEventListener("click", () => {
      $("#template").value = button.dataset.template;
      showPage("editor");
      toast(`${button.dataset.template[0].toUpperCase()+button.dataset.template.slice(1)} template selected`);
    }));
  }
  async function init() {
    setupNavigation();
    if (!configReady || !window.supabase) {
      setStatus("#manage-status", "Setup needed: add your Supabase URL and publishable/anon key in config.js, then follow README.md.", "error");
      setStatus("#form-status", "Connect Supabase first. Follow README.md, then refresh this page.", "error");
      $("#save-button").disabled = true;
      $("#preview-button").disabled = false;
      $("#portfolio-list").innerHTML = '<div class="empty-state">Connect your Supabase project to save and manage portfolios. You can still fill out the form and preview locally.</div>';
      $("#preview-button").addEventListener("click", previewFromForm);
      $("#portfolio-form").addEventListener("submit", event => { event.preventDefault(); previewFromForm(); toast("Preview only — connect Supabase to save online."); });
      $("#edit-current-button").addEventListener("click", () => showPage("editor"));
      $("#print-button").addEventListener("click", () => window.print());
      $("#cancel-edit-button").addEventListener("click", resetForm);
      $("#profile_file").addEventListener("change", handlePictureFile);
      return;
    }
    supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) currentUser = sessionData.session.user;
    if (!currentUser) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        setStatus("#manage-status", "Could not start a secure session. Enable Anonymous Sign-Ins in Supabase Authentication settings. " + error.message, "error");
        setStatus("#form-status", "Supabase sign-in setup required. Check README.md.", "error");
        $("#save-button").disabled = true;
        $("#portfolio-list").innerHTML = '<div class="empty-state">Enable Anonymous Sign-Ins in Supabase, then refresh this page.</div>';
        return;
      }
      currentUser = data.user;
    }
    supabase.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; });
    $("#portfolio-form").addEventListener("submit", savePortfolio);
    $("#preview-button").addEventListener("click", previewFromForm);
    $("#edit-current-button").addEventListener("click", () => {
      if (currentPortfolio) loadPortfolioIntoForm(currentPortfolio);
      showPage("editor");
    });
    $("#print-button").addEventListener("click", () => window.print());
    $("#cancel-edit-button").addEventListener("click", resetForm);
    $("#profile_file").addEventListener("change", handlePictureFile);
    await loadPortfolios();
  }
  function splitLines(value) { return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean); }
  function parseEntries(value, field) {
    return splitLines(value).map(line => {
      const parts = line.split("|").map(part => part.trim());
      if (field === "education") return { qualification: parts[0] || "", school: parts[1] || "", year: parts[2] || "" };
      if (field === "projects") return { name: parts[0] || "", description: parts[1] || "", url: safeUrl(parts[2] || "") };
      if (field === "experience") return { role: parts[0] || "", organization: parts[1] || "", dates: parts[2] || "", description: parts.slice(3).join(" | ") || "" };
      if (field === "social_links") return { label: parts[0] || "Website", url: safeUrl(parts[1] || "") };
      return {};
    }).filter(item => Object.values(item).some(value => value));
  }
  function collectForm() {
    return {
      full_name: $("#full_name").value.trim(),
      email: $("#email").value.trim(),
      contact_number: $("#contact_number").value.trim(),
      address: $("#address").value.trim(),
      about_me: $("#about_me").value.trim(),
      profile_picture: safeUrl($("#profile_picture").value.trim()) || uploadedPictureUrl || "",
      education: parseEntries($("#education").value, "education"),
      skills: $("#skills").value.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0,100),
      projects: parseEntries($("#projects").value, "projects"),
      experience: parseEntries($("#experience").value, "experience"),
      social_links: parseEntries($("#social_links").value, "social_links"),
      template: $("#template").value,
      title: $("#portfolio_title").value.trim() || `${$("#full_name").value.trim()}'s Portfolio`
    };
  }
  function validatePortfolio(data) {
    if (!data.full_name) return "Please enter your full name.";
    if ($("#profile_picture").value.trim() && !safeUrl($("#profile_picture").value.trim())) return "Use a valid http:// or https:// profile picture URL.";
    if (!["simple","modern","creative"].includes(data.template)) return "Choose one of the three available templates.";
    return "";
  }
  async function handlePictureFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) { toast("Please choose a JPG, PNG, or WebP image."); event.target.value=""; return; }
    if (file.size > 2 * 1024 * 1024) { toast("Please choose an image smaller than 2 MB."); event.target.value=""; return; }
    if (!supabase || !currentUser) {
      toast("Connect Supabase to upload. You can use a public image URL instead.");
      event.target.value = "";
      return;
    }
    setStatus("#form-status", "Uploading profile picture…");
    try {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${currentUser.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("profile-pictures").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("profile-pictures").getPublicUrl(path);
      uploadedPictureUrl = data.publicUrl;
      $("#profile_picture").value = uploadedPictureUrl;
      setStatus("#form-status", "Profile picture uploaded. Save your portfolio to keep the link.", "success");
    } catch (error) {
      setStatus("#form-status", `Image upload failed: ${error.message}. You can paste an image URL instead.`, "error");
    }
  }
  function formToTextArea(data) {
    $("#education").value = (data.education || []).map(e => [e.qualification,e.school,e.year].filter(Boolean).join(" | ")).join("\n");
    $("#skills").value = (data.skills || []).join(", ");
    $("#projects").value = (data.projects || []).map(e => [e.name,e.description,e.url].filter(Boolean).join(" | ")).join("\n");
    $("#experience").value = (data.experience || []).map(e => [e.role,e.organization,e.dates,e.description].filter(Boolean).join(" | ")).join("\n");
    $("#social_links").value = (data.social_links || []).map(e => [e.label,e.url].filter(Boolean).join(" | ")).join("\n");
  }
  function fillForm(data) {
    ["full_name","email","contact_number","address","about_me","profile_picture","template"].forEach(key => {
      const el = $(`#${key}`);
      if (el) el.value = data[key] || (key === "template" ? "simple" : "");
    });
    $("#portfolio_title").value = data.title || "";
    formToTextArea(data);
    uploadedPictureUrl = data.profile_picture || "";
  }
  function resetForm() {
    editingId = null;
    uploadedPictureUrl = "";
    $("#portfolio-form").reset();
    $("#template").value = "simple";
    $("#editor-title").textContent = "Create your portfolio";
    $("#save-button").textContent = "Save portfolio";
    $("#cancel-edit-button").classList.add("hidden");
    setStatus("#form-status", "");
  }
  function loadPortfolioIntoForm(portfolio) {
    editingId = portfolio.id;
    fillForm(portfolio);
    $("#editor-title").textContent = "Edit your portfolio";
    $("#save-button").textContent = "Update portfolio";
    $("#cancel-edit-button").classList.remove("hidden");
    setStatus("#form-status", "Editing saved portfolio. Save changes when finished.");
    showPage("editor");
  }
  function previewFromForm() {
    const data = collectForm();
    const issue = validatePortfolio(data);
    if (issue) { setStatus("#form-status", issue, "error"); return; }
    currentPortfolio = data;
    renderPortfolio(data);
    showPage("preview");
  }
  async function savePortfolio(event) {
    event.preventDefault();
    if (!supabase || !currentUser) { previewFromForm(); toast("Preview only — connect Supabase to save online."); return; }
    const data = collectForm();
    const issue = validatePortfolio(data);
    if (issue) { setStatus("#form-status", issue, "error"); return; }
    const row = {
      user_id: currentUser.id,
      title: data.title,
      full_name: data.full_name,
      profile_picture: data.profile_picture || null,
      email: data.email || null,
      contact_number: data.contact_number || null,
      address: data.address || null,
      about_me: data.about_me || null,
      education: data.education,
      skills: data.skills,
      projects: data.projects,
      experience: data.experience,
      social_links: data.social_links,
      template: data.template
    };
    $("#save-button").disabled = true;
    setStatus("#form-status", editingId ? "Updating your portfolio…" : "Saving to the online database…");
    try {
      let result;
      if (editingId) {
        result = await supabase.from("portfolios").update(row).eq("id", editingId).eq("user_id", currentUser.id).select().single();
      } else {
        result = await supabase.from("portfolios").insert(row).select().single();
      }
      if (result.error) throw result.error;
      currentPortfolio = {...result.data, title: result.data.title};
      editingId = result.data.id;
      await loadPortfolios();
      renderPortfolio(currentPortfolio);
      setStatus("#form-status", "Saved successfully to Supabase.", "success");
      toast("Portfolio saved online!");
      showPage("preview");
    } catch (error) {
      setStatus("#form-status", `Save failed: ${error.message}. Check your Supabase table and policies in README.md.`, "error");
    } finally { $("#save-button").disabled = false; }
  }
  async function loadPortfolios() {
    if (!supabase || !currentUser) return;
    setStatus("#manage-status", "Loading your saved portfolios…");
    const { data, error } = await supabase.from("portfolios").select("*").order("updated_at", {ascending:false});
    if (error) {
      setStatus("#manage-status", `Could not load portfolios: ${error.message}. Check schema.sql and Row Level Security.`, "error");
      return;
    }
    portfoliosCache = data || [];
    setStatus("#manage-status", `${portfoliosCache.length} saved portfolio${portfoliosCache.length===1?"":"s"}.`, "success");
    renderManageList();
  }
  function renderManageList() {
    const list = $("#portfolio-list");
    if (!portfoliosCache.length) {
      list.innerHTML = '<div class="empty-state"><h3>No saved portfolios yet</h3><p>Create your first portfolio and it will appear here.</p><button class="btn btn-primary" data-page="editor">Create a portfolio</button></div>';
      list.querySelector("[data-page]")?.addEventListener("click", () => { resetForm(); showPage("editor"); });
      return;
    }
    list.innerHTML = portfoliosCache.map(p => `<article class="saved-card">
      <div class="saved-top"><span class="template-tag">${esc(p.template || "simple")}</span><span aria-hidden="true">✦</span></div>
      <h3>${esc(p.title || p.full_name || "Untitled portfolio")}</h3><p>${esc(p.full_name || "")}${p.email ? ` · ${esc(p.email)}` : ""}</p>
      <div class="saved-date">Updated ${p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "recently"}</div>
      <div class="saved-actions"><button class="btn btn-primary" data-action="view" data-id="${esc(p.id)}">View</button><button class="btn btn-secondary" data-action="edit" data-id="${esc(p.id)}">Edit</button><button class="btn btn-secondary" data-action="delete" data-id="${esc(p.id)}">Delete</button></div>
    </article>`).join("");
    list.querySelectorAll("button[data-action]").forEach(button => button.addEventListener("click", async () => {
      const p = portfoliosCache.find(item => item.id === button.dataset.id);
      if (!p) return;
      if (button.dataset.action === "view") { currentPortfolio = p; editingId = p.id; renderPortfolio(p); showPage("preview"); }
      if (button.dataset.action === "edit") loadPortfolioIntoForm(p);
      if (button.dataset.action === "delete") await askDelete(p);
    }));
  }
  async function askDelete(portfolio) {
    deleteTarget = portfolio;
    const dialog = $("#delete-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else if (confirm(`Delete ${portfolio.title || portfolio.full_name}?`)) await deletePortfolio();
  }
  $("#confirm-delete").addEventListener("click", async event => {
    event.preventDefault();
    $("#delete-dialog").close();
    await deletePortfolio();
  });
  async function deletePortfolio() {
    if (!deleteTarget || !supabase || !currentUser) return;
    const target = deleteTarget;
    deleteTarget = null;
    const { error } = await supabase.from("portfolios").delete().eq("id", target.id).eq("user_id", currentUser.id);
    if (error) { setStatus("#manage-status", `Delete failed: ${error.message}`, "error"); return; }
    if (editingId === target.id) resetForm();
    if (currentPortfolio?.id === target.id) currentPortfolio = null;
    toast("Portfolio deleted.");
    await loadPortfolios();
  }
  function section(title, content) {
    if (!content) return "";
    return `<section class="portfolio-section"><h2>${esc(title)}</h2>${content}</section>`;
  }
  function renderEntries(items, kind) {
    if (!Array.isArray(items) || !items.length) return "";
    return `<div class="portfolio-list-items">${items.map(item => {
      if (kind === "education") return `<article class="portfolio-entry"><h3>${esc(item.qualification || item.school || "Education")}</h3><p class="entry-meta">${esc([item.school,item.year].filter(Boolean).join(" · "))}</p></article>`;
      if (kind === "projects") return `<article class="portfolio-entry"><h3>${esc(item.name || "Project")}</h3>${item.description ? `<p>${esc(item.description)}</p>`:""}${safeUrl(item.url) ? `<p><a href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">View project ↗</a></p>`:""}</article>`;
      return `<article class="portfolio-entry"><h3>${esc(item.role || "Experience")}</h3><p class="entry-meta">${esc([item.organization,item.dates].filter(Boolean).join(" · "))}</p>${item.description ? `<p>${esc(item.description)}</p>`:""}</article>`;
    }).join("")}</div>`;
  }
  function renderPortfolio(p) {
    const template = ["simple","modern","creative"].includes(p.template) ? p.template : "simple";
    const picture = safeUrl(p.profile_picture || "");
    const avatar = picture ? `<img class="portfolio-avatar" src="${esc(picture)}" alt="${esc(p.full_name || "Profile picture")}" onerror="this.style.display='none'">` : `<div class="portfolio-avatar portfolio-avatar-fallback">${esc((p.full_name || "P").trim().charAt(0).toUpperCase())}</div>`;
    const contact = [p.email,p.contact_number,p.address].filter(Boolean).map(esc).join('<span aria-hidden="true">•</span>');
    const about = p.about_me ? `<p>${esc(p.about_me)}</p>` : "";
    const skills = Array.isArray(p.skills) && p.skills.length ? `<div class="portfolio-skills">${p.skills.map(s=>`<span class="skill-pill">${esc(s)}</span>`).join("")}</div>` : "";
    const links = Array.isArray(p.social_links) && p.social_links.length ? `<div class="portfolio-links">${p.social_links.filter(l=>safeUrl(l.url)).map(l=>`<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.label || "Website")} ↗</a>`).join("")}</div>` : "";
    const html = `<article class="portfolio-sheet template-${template}">
      <header class="portfolio-hero">${avatar}<div><span class="eyebrow">PERSONAL PORTFOLIO</span><h1>${esc(p.full_name || "Your Name")}</h1><p class="portfolio-subtitle">${esc(p.title || "Portfolio")}</p>${contact ? `<div class="portfolio-contact">${contact}</div>`:""}</div></header>
      <div class="portfolio-content">
        ${section("About me",about)}
        ${section("Education",renderEntries(p.education,"education"))}
        ${section("Skills",skills)}
        ${section("Projects",renderEntries(p.projects,"projects"))}
        ${section("Experience",renderEntries(p.experience,"experience"))}
        ${section("Find me online",links)}
      </div>
    </article>`;
    $("#portfolio-render").innerHTML = html;
    $("#preview-heading").textContent = p.title || `${p.full_name || "Your"} portfolio`;
  }
  init();
})();