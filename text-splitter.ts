const NOBR_REGEXP = /[[[\P{scx=Han}]&&[\P{scx=Hang}]&&[\P{scx=Hira}]&&[\P{scx=Kana}]&&[\p{L}]]!-,.->@\[-`\{-~\u00A0]+/gv;
const LBR_PROHIBIT_START_REGEXP = /^[[[\p{Pd}]--[―]]\p{Pe}\p{Pf}\p{Po}\u00A0々〵〻ぁぃぅぇぉっゃゅょゎゕゖ゛-ゞァィゥェォッャュョヮヵヶー-ヾㇰ-ㇿ]|\p{Pi}/v;
const LBR_PROHIBIT_END_REGEXP = /[\p{Pf}\p{Pi}\p{Ps}\p{Sc}\u00A0]$/u;
const LBR_INSEPARATABLE_REGEXP = /[―]/u;

type TextSplitterOptions = {
  concatChar: boolean;
  lineBreakingRules: boolean;
  wordSegmenter: boolean;
};

class TextSplitter {
  rootElement: HTMLElement;
  defaults: TextSplitterOptions;
  settings: TextSplitterOptions;
  original: string;
  domElement: HTMLElement;
  wordElements: HTMLElement[];
  charElements: HTMLElement[];

  constructor(root: HTMLElement, options?: Partial<TextSplitterOptions>) {
    this.rootElement = root;
    this.defaults = {
      concatChar: false,
      lineBreakingRules: true,
      wordSegmenter: false,
    };
    this.settings = { ...this.defaults, ...options };
    this.original = this.rootElement.innerHTML;
    this.domElement = this.rootElement.cloneNode(true) as HTMLElement;
    this.wordElements = [];
    this.charElements = [];
    this.initialize();
  }

  private initialize(): void {
    this.nobr();
    this.split('word');
    if (this.settings.lineBreakingRules && !this.settings.concatChar) this.lbr('word');
    this.split('char');
    if (this.settings.lineBreakingRules && this.settings.concatChar) this.lbr('char');
    this.wordElements.forEach((word, i) => {
      word.setAttribute('translate', 'no');
      word.style.setProperty('--word-index', String(i));
      if (!word.hasAttribute('data-whitespace')) {
        let alt = document.createElement('span');
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
      char.style.setProperty('--char-index', String(i));
    });
    this.domElement.querySelectorAll(':is([data-word], [data-char]):not([data-whitespace])').forEach(span => {
      (span as HTMLElement).style.setProperty('display', 'inline-block');
      (span as HTMLElement).style.setProperty('white-space', 'nowrap');
    });
    this.rootElement.replaceChildren(...this.domElement.childNodes);
    this.rootElement.style.setProperty('--word-length', String(this.wordElements.length));
    this.rootElement.style.setProperty('--char-length', String(this.charElements.length));
    [...this.rootElement.querySelectorAll(':scope > :not([data-word]) [data-char][data-whitespace]')].forEach(whitespace => {
      if (window.getComputedStyle(whitespace).getPropertyValue('display') !== 'inline') whitespace.innerHTML = '&nbsp;';
    });
    this.rootElement.setAttribute('data-text-splitter-initialized', '');
  }

  private nobr(node = this.domElement): void {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent!;
      let matches = [...text.matchAll(NOBR_REGEXP)];
      if (matches.length === 0) return;
      let index = 0;
      matches.forEach(match => {
        let offset = match.index;
        if (offset > index) node.before(text.slice(index, offset));
        let span = document.createElement('span');
        span.setAttribute('data-_nobr_', '');
        let matched = match[0];
        span.textContent = matched;
        node.before(span);
        index = offset + matched.length;
      });
      if (index < text.length) node.before(text.slice(index));
      node.remove();
    } else if (node.hasChildNodes()) {
      [...node.childNodes].forEach(node => this.nobr(node as HTMLElement));
    }
  }

  private split(by: 'word' | 'char', node = this.domElement): void {
    let items = this[`${by}Elements` as 'words' | 'chars'];
    [...node.childNodes].forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        let segments = [...new Intl.Segmenter((node.parentNode as HTMLElement).closest('[lang]')!.getAttribute('lang') || document.documentElement.getAttribute('lang') || 'en', by === 'word' && this.settings.wordSegmenter ? { granularity: 'word' } : {}).segment(node.textContent!.replace(/[\r\n\t]/g, '').replace(/\s{2,}/g, ' '))];
        segments.forEach(segment => {
          let span = document.createElement('span');
          let text = segment.segment || ' ';
          [by, segment.segment.charCodeAt(0) === 32 && 'whitespace'].filter(Boolean).forEach(type => span.setAttribute(`data-${type}`, type !== 'whitespace' ? text : ''));
          span.textContent = text;
          items.push(span);
          node.before(span);
        });
        node.remove();
      } else if (by === 'word' && node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).hasAttribute('data-_nobr_')) {
        (node as HTMLElement).removeAttribute('data-_nobr_');
        (node as HTMLElement).setAttribute('data-word', node.textContent!);
        items.push(node as HTMLElement);
      } else if (node.hasChildNodes()) {
        this.split(by, node as HTMLElement);
      }
    });
  }

  private lbr(by: 'word' | 'char'): void {
    let items = this[`${by}Elements` as 'words' | 'chars'];
    let previous = null;
    for (let i = 0; i < items.length; i++) {
      let item = items[i];
      if (previous && previous.textContent!.trim() && LBR_PROHIBIT_START_REGEXP.test([...new Intl.Segmenter(item.closest('[lang]')!.getAttribute('lang') || document.documentElement.getAttribute('lang') || 'en').segment(item.textContent!)].shift()!.segment)) {
        previous.setAttribute(`data-${by}`, (previous.textContent += item.textContent!));
        item.remove();
        items.splice(i, 1);
        i--;
      } else {
        previous = item;
      }
    }
    let concat = (item: HTMLElement, regexp: RegExp, index: number): void => {
      let offset = index + 1;
      let next = items[offset];
      while (next && regexp.test(next.textContent!)) {
        item.setAttribute(`data-${by}`, (item.textContent! += next.textContent));
        next.remove();
        items.splice(offset, 1);
        next = items[offset];
      }
    };
    items.forEach((item: HTMLElement, i: number) => {
      if (LBR_PROHIBIT_END_REGEXP.test(item.textContent!)) {
        concat(item, LBR_PROHIBIT_END_REGEXP, i);
        let next = items[i + 1];
        if (next && next.textContent!.trim()) {
          next.setAttribute(`data-${by}`, (next.textContent = item.textContent! + next.textContent));
          item.remove();
          items.splice(i, 1);
        }
      }
    });
    items.forEach((item: HTMLElement, i: number) => {
      if (LBR_INSEPARATABLE_REGEXP.test(item.textContent!)) concat(item, LBR_INSEPARATABLE_REGEXP, i);
    });
    if (by === 'char') {
      this.domElement.querySelectorAll('[data-word]:not([data-whitespace])').forEach(span => {
        if (span.textContent) {
          span.setAttribute('data-word', span.textContent);
        } else {
          span.remove();
        }
      });
    }
  }

  revert(): void {
    this.rootElement.style.removeProperty('--word-length');
    this.rootElement.style.removeProperty('--char-length');
    this.rootElement.innerHTML = this.original;
  }
}

export default TextSplitter;
