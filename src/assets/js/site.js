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

  // ---- FAQ accordions ----
  // Converts plain "Frequently Asked Questions" sections into <details> accordions.
  // Supports two authoring formats produced by the markdown renderer:
  //   Format A: <p><strong>Q?</strong></p> <p>Answer</p>  (separate paragraphs)
  //   Format B: <p><strong>Q?</strong>\nAnswer text</p>   (question+answer in one <p>)
  // Output: each Q/A pair → <details class="faq__item"><summary class="faq__q"><span>Q</span>
  //         </summary><div class="faq__a">A</div></details> inside a <div class="faq">.
  // The question is wrapped in a <span> so inline elements (<code>, <em>) remain a single
  // flex item and don't fragment under justify-content:space-between.
  function initFAQAccordions() {
    var norm = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };
    var isFaqHead = function (h) {
      var t = norm(h.textContent).toLowerCase().replace(/^[\s#¶]+|[\s#¶?:.]+$/g, '');
      return /frequently asked questions?|^faqs?$|^common questions$|^q ?& ?a$/.test(t);
    };
    var heads = Array.prototype.slice.call(document.querySelectorAll('h2, h3'));
    heads.filter(isFaqHead).forEach(function (h) {
      var items = [];
      var el = h.nextElementSibling;
      // Walk siblings until next same-level heading or a thematic break.
      while (el && el.tagName !== h.tagName && el.tagName !== 'H2' && el.tagName !== 'HR') {
        items.push(el);
        el = el.nextElementSibling;
      }

      // Identify Q/A pairs. A question element is either:
      //   - <p> whose sole element child is <strong> ending in "?"
      //   - <h3>/<h4> ending in "?" (authoring variant)
      var pairs = [];
      var i = 0;
      while (i < items.length) {
        var node = items[i];
        var isStrongQ = node.tagName === 'P' && node.firstElementChild &&
          node.firstElementChild.tagName === 'STRONG' &&
          norm(node.firstElementChild.textContent).endsWith('?');
        // Format B: question and answer in the same <p>. The <strong> is the first child but
        // there is also text/other content after it.
        var isFormatB = false;
        if (node.tagName === 'P' && node.firstElementChild &&
            node.firstElementChild.tagName === 'STRONG' &&
            norm(node.firstElementChild.textContent).endsWith('?')) {
          // Check if there's trailing content after the <strong> in the same <p>
          var hasTrailing = false;
          var child = node.firstElementChild.nextSibling;
          while (child) {
            if (child.nodeType === 3 && norm(child.textContent).length > 0) { hasTrailing = true; break; }
            if (child.nodeType === 1) { hasTrailing = true; break; }
            child = child.nextSibling;
          }
          isFormatB = hasTrailing;
        }
        var isHeadingQ = /^H[3-4]$/.test(node.tagName) &&
          norm(node.textContent).replace(/[\s#¶]+$/, '').endsWith('?');

        if (isFormatB) {
          // Split: strong is the question, rest of the <p> content is the answer.
          var qEl = node.firstElementChild; // <strong>
          var answerDiv = document.createElement('div');
          // Clone remaining siblings of <strong> within the <p>
          var sib = qEl.nextSibling;
          // Skip leading whitespace/newline text node
          while (sib && sib.nodeType === 3 && norm(sib.textContent).length === 0) {
            sib = sib.nextSibling;
          }
          while (sib) {
            answerDiv.appendChild(sib.cloneNode(true));
            sib = sib.nextSibling;
          }
          // Wrap in <p> if the answer text isn't already block content
          if (answerDiv.children.length === 0 && answerDiv.textContent.trim()) {
            var ap = document.createElement('p');
            ap.innerHTML = answerDiv.innerHTML;
            answerDiv.innerHTML = '';
            answerDiv.appendChild(ap);
          }
          pairs.push({ qNode: node, qEl: qEl, answer: [answerDiv], formatB: true });
          i++;
        } else if (isStrongQ || isHeadingQ) {
          // Collect following non-question siblings as answer
          var answerNodes = [];
          var j = i + 1;
          while (j < items.length) {
            var next = items[j];
            var nextIsQ = (next.tagName === 'P' && next.firstElementChild &&
              next.firstElementChild.tagName === 'STRONG' &&
              norm(next.firstElementChild.textContent).endsWith('?')) ||
              (/^H[3-4]$/.test(next.tagName) && norm(next.textContent).replace(/[\s#¶]+$/, '').endsWith('?'));
            if (nextIsQ) break;
            answerNodes.push(next);
            j++;
          }
          pairs.push({ qNode: node, qEl: isStrongQ ? node.firstElementChild : node, answer: answerNodes, formatB: false });
          i = j;
        } else {
          i++;
        }
      }

      if (pairs.length === 0) return;

      // Build the accordion container
      var faqDiv = document.createElement('div');
      faqDiv.className = 'faq';

      pairs.forEach(function (pair) {
        var details = document.createElement('details');
        details.className = 'faq__item';

        var summary = document.createElement('summary');
        summary.className = 'faq__q';
        // Wrap the question content in a <span> so inline elements form a single flex item
        var span = document.createElement('span');
        span.innerHTML = pair.qEl.innerHTML;
        summary.appendChild(span);
        details.appendChild(summary);

        var ansDiv = document.createElement('div');
        ansDiv.className = 'faq__a';
        if (pair.formatB) {
          // answer is a single div with cloned content
          var content = pair.answer[0];
          if (content.children.length > 0) {
            var ch = content.firstChild;
            while (ch) { ansDiv.appendChild(ch.cloneNode(true)); ch = ch.nextSibling; }
          } else {
            ansDiv.innerHTML = content.innerHTML;
          }
        } else {
          pair.answer.forEach(function (aNode) {
            ansDiv.appendChild(aNode.cloneNode(true));
          });
        }
        details.appendChild(ansDiv);
        faqDiv.appendChild(details);
      });

      // Insert the accordion div before the heading, then remove the heading and all items
      h.parentNode.insertBefore(faqDiv, h);
      // Remove original items (answers and questions)
      items.forEach(function (node) { if (node.parentNode) node.parentNode.removeChild(node); });
      // Remove the FAQ heading itself
      h.parentNode.removeChild(h);
    });
  }
  initFAQAccordions();

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
