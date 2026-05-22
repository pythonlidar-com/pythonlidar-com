/* Python LiDAR — site JS
   - Mobile nav toggle
   - Copy-to-clipboard on code blocks
   - Interactive task-list checkboxes (with line-through when checked)
   - Mermaid lazy loader
*/

(function () {
  "use strict";

  // ---- mobile nav ----
  var navToggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // ---- code block copy buttons ----
  document.querySelectorAll(".codeblock__copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var block = btn.closest(".codeblock");
      if (!block) return;
      var code = block.querySelector("pre code");
      if (!code) return;
      var text = code.innerText;
      var done = function () {
        var prev = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.add("is-copied");
        setTimeout(function () {
          btn.textContent = prev;
          btn.classList.remove("is-copied");
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
      } else {
        fallbackCopy(text, done);
      }
    });
  });

  function fallbackCopy(text, cb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    document.body.removeChild(ta);
    if (cb) cb();
  }

  // ---- interactive task list checkboxes ----
  // markdown-it-task-lists renders disabled checkboxes; un-disable + wire line-through.
  document.querySelectorAll("li.task-list-item > input.task-list-item-checkbox").forEach(function (cb) {
    cb.disabled = false;
    var li = cb.parentElement;
    if (cb.checked) li.classList.add("is-checked");
    cb.addEventListener("change", function () {
      li.classList.toggle("is-checked", cb.checked);
    });
  });

  // ---- mermaid (lazy-load only if any block is present) ----
  if (document.querySelector(".mermaid")) {
    var s = document.createElement("script");
    s.src = "/assets/js/mermaid.min.js";
    s.onload = function () {
      if (window.mermaid) {
        window.mermaid.initialize({
          startOnLoad: true,
          theme: "base",
          themeVariables: {
            primaryColor: "#ece8ff",
            primaryTextColor: "#1f2740",
            primaryBorderColor: "#5b3df5",
            lineColor: "#5b3df5",
            secondaryColor: "#d9f5f8",
            tertiaryColor: "#fff0d8",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
          },
        });
      }
    };
    document.head.appendChild(s);
  }
})();
