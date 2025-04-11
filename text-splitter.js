const NOBR_REGEXP = /[[[\P{scx=Han}]&&[\P{scx=Hang}]&&[\P{scx=Hira}]&&[\P{scx=Kana}]&&[\p{L}]]!-,.->@\[-`\{-~\u00A0]+/gv;
const LBR_PROHIBIT_START_REGEXP = /^[[[\p{Pd}]--[―]]\p{Pe}\p{Pf}\p{Po}\u00A0々〵〻ぁぃぅぇぉっゃゅょゎゕゖ゛-ゞァィゥェォッャュョヮヵヶー-ヾㇰ-ㇿ]|\p{Pi}/v;
const LBR_PROHIBIT_END_REGEXP = /[\p{Pf}\p{Pi}\p{Ps}\p{Sc}\u00A0]$/u;
const LBR_INSEPARATABLE_REGEXP = /[―‥…]/u;

export class TextSplitter {
  constructor(root, options) {
    this.rootElement = root;
    this.defaults = {
      concatChar: false,
      lineBreakingRules: true,
      wordSegmenter: false,
    };
    this.settings = { ...this.defaults, ...options };
    this.original = this.rootElement.innerHTML;
    this.fragment = new DocumentFragment();
    [...this.rootElement.childNodes].forEach(node => this.fragment.appendChild(node.cloneNode(true)));
    this.wordElements = [];
    this.charElements = [];
    this.initialize();
  }

  initialize() {
    this.nobr();
    this.split('word');
    if (this.settings.lineBreakingRules && !this.settings.concatChar) this.lbr('word');
    this.split('char');
    if (this.settings.lineBreakingRules && this.settings.concatChar) this.lbr('char');
    this.wordElements.forEach((word, i) => {
      word.setAttribute('translate', 'no');
      word.style.setProperty('--word-index', i);
      if (!word.hasAttribute('data-whitespace')) {
        const alt = document.createElement('span');
        alt.setAttribute('data-alt', '');
        alt.style.cssText += `
          border: 0;
          clip: rect(0, 0, 0, 0);
          height: 1px;
          margin: -1px;
          overflow: hidden;
          padding: 0;
          position: absolute;
          user-select: none;
          white-space: nowrap;
          width: 1px;
        `;
        alt.textContent = word.textContent;
        word.append(alt);
      }
    });
    this.charElements.forEach((char, i) => {
      char.setAttribute('aria-hidden', 'true');
      char.style.setProperty('--char-index', i);
    });
    this.fragment.querySelectorAll(':is([data-word], [data-char]):not([data-whitespace])').forEach(span => {
      span.style.setProperty('display', 'inline-block');
      span.style.setProperty('white-space', 'nowrap');
    });
    this.rootElement.replaceChildren(...this.fragment.childNodes);
    this.rootElement.style.setProperty('--word-length', this.wordElements.length);
    this.rootElement.style.setProperty('--char-length', this.charElements.length);
    [...this.rootElement.querySelectorAll(':scope > :not([data-word]) [data-char][data-whitespace]')].forEach(whitespace => {
      if (window.getComputedStyle(whitespace).getPropertyValue('display') !== 'inline') whitespace.innerHTML = '&nbsp;';
    });
    this.rootElement.setAttribute('data-text-splitter-initialized', '');
  }

  nobr(node = this.fragment) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      const matches = [...text.matchAll(NOBR_REGEXP)];
      if (matches.length === 0) return;
      let index = 0;
      matches.forEach(match => {
        const offset = match.index;
        if (offset > index) node.before(text.slice(index, offset));
        const span = document.createElement('span');
        span.setAttribute('data-_nobr_', '');
        const matched = match[0];
        span.textContent = matched;
        node.before(span);
        index = offset + matched.length;
      });
      if (index < text.length) node.before(text.slice(index));
      node.remove();
    } else if (node.hasChildNodes()) {
      [...node.childNodes].forEach(node => this.nobr(node));
    }
  }

  split(by, node = this.fragment) {
    const items = this[`${by}Elements`];
    [...node.childNodes].forEach(node => {
      const text = node.textContent;
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentNode;
        const segments = [...new Intl.Segmenter((parent.nodeType === Node.ELEMENT_NODE ? parent : this.rootElement).closest('[lang]')?.getAttribute('lang') || document.documentElement.getAttribute('lang') || 'en', by === 'word' && this.settings.wordSegmenter ? { granularity: 'word' } : {}).segment(text.replace(/[\r\n\t]/g, '').replace(/\s{2,}/g, ' '))];
        segments.forEach(segment => {
          const span = document.createElement('span');
          const text = segment.segment || ' ';
          [by, segment.segment.charCodeAt(0) === 32 && 'whitespace'].filter(Boolean).forEach(type => span.setAttribute(`data-${type}`, type !== 'whitespace' ? text : ''));
          span.textContent = text;
          items.push(span);
          node.before(span);
        });
        node.remove();
      } else if (by === 'word' && node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-_nobr_')) {
        node.removeAttribute('data-_nobr_');
        node.setAttribute('data-word', text);
        items.push(node);
      } else if (node.hasChildNodes()) {
        this.split(by, node);
      }
    });
  }

  lbr(by) {
    const items = this[`${by}Elements`];
    let previous = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const text = item.textContent;
      if (previous && previous.textContent.trim() && LBR_PROHIBIT_START_REGEXP.test([...new Intl.Segmenter(item.closest('[lang]')?.getAttribute('lang') || document.documentElement.getAttribute('lang') || 'en').segment(text)].shift().segment)) {
        previous.setAttribute(`data-${by}`, (previous.textContent += text));
        item.remove();
        items.splice(i, 1);
        i--;
      } else {
        previous = item;
      }
    }
    const concat = (item, regexp, index) => {
      const offset = index + 1;
      let next = items[offset];
      let text;
      while (next && regexp.test((text = next.textContent))) {
        item.setAttribute(`data-${by}`, (item.textContent += text));
        next.remove();
        items.splice(offset, 1);
        next = items[offset];
      }
    };
    items.forEach((item, i) => {
      if (LBR_PROHIBIT_END_REGEXP.test(item.textContent)) {
        concat(item, LBR_PROHIBIT_END_REGEXP, i);
        const next = items[i + 1];
        const text = next?.textContent;
        if (next && text.trim()) {
          next.setAttribute(`data-${by}`, (next.textContent = item.textContent + text));
          item.remove();
          items.splice(i, 1);
        }
      }
    });
    items.forEach((item, i) => {
      if (LBR_INSEPARATABLE_REGEXP.test(item.textContent)) concat(item, LBR_INSEPARATABLE_REGEXP, i);
    });
    if (by === 'char') {
      this.fragment.querySelectorAll('[data-word]:not([data-whitespace])').forEach(span => {
        const text = span.textContent;
        if (text) {
          span.setAttribute('data-word', text);
        } else {
          span.remove();
        }
      });
    }
  }

  destroy() {
    this.rootElement.removeAttribute('data-text-splitter-initialized');
    ['--word-length', '--char-length'].forEach(name => this.rootElement.style.removeProperty(name));
    this.rootElement.innerHTML = this.original;
  }
}
