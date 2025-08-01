type TextSplitterOptions = {
  concatChar: boolean;
  lineBreakingRules: boolean;
  wordSegmenter: boolean;
};

const NOBR_REGEXP = /[[[\P{scx=Han}]&&[\P{scx=Hang}]&&[\P{scx=Hira}]&&[\P{scx=Kana}]&&[\p{L}]]!-,.->@\[-`\{-~\u00A0]+/gv;
const LBR_PROHIBIT_START_REGEXP = /^[[[\p{Pd}]--[―]]\p{Pe}\p{Pf}\p{Po}\u00A0々〵〻ぁぃぅぇぉっゃゅょゎゕゖ゛-ゞァィゥェォッャュョヮヵヶー-ヾㇰ-ㇿ]|\p{Pi}/v;
const LBR_PROHIBIT_END_REGEXP = /[\p{Pf}\p{Pi}\p{Ps}\p{Sc}\u00A0]$/u;
const LBR_INSEPARATABLE_REGEXP = /[―‥…]/u;

export class TextSplitter {
  private rootElement!: HTMLElement;
  private defaults!: TextSplitterOptions;
  private settings!: TextSplitterOptions;
  private original!: string;
  private fragment!: DocumentFragment;
  private wordElements!: HTMLElement[];
  private charElements!: HTMLElement[];

  constructor(root: HTMLElement, options?: Partial<TextSplitterOptions>) {
    if (!root) {
      return;
    }
    this.rootElement = root;
    this.defaults = {
      concatChar: false,
      lineBreakingRules: true,
      wordSegmenter: false,
    };
    this.settings = { ...this.defaults, ...options };
    this.original = this.rootElement.innerHTML;
    this.fragment = new DocumentFragment();
    this.wordElements = [];
    this.charElements = [];
    this.initialize();
  }

  private initialize(): void {
    [...this.rootElement.childNodes].forEach(node => this.fragment.appendChild(node.cloneNode(true)));
    this.nobr();
    this.split('word');
    if (this.settings.lineBreakingRules && !this.settings.concatChar) {
      this.lbr('word');
    }
    this.split('char');
    if (this.settings.lineBreakingRules && this.settings.concatChar) {
      this.lbr('char');
    }
    this.wordElements.forEach((word, i) => {
      word.translate = false;
      word.style.setProperty('--word-index', String(i));
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
      char.style.setProperty('--char-index', String(i));
    });
    (this.fragment.querySelectorAll(':is([data-word], [data-char]):not([data-whitespace])') as unknown as HTMLElement[]).forEach(span => {
      Object.assign(span.style, {
        display: 'inline-block',
        whiteSpace: 'nowrap',
      });
    });
    this.rootElement.replaceChildren(...this.fragment.childNodes);
    Object.entries({
      '--word-length': String(this.wordElements.length),
      '--char-length': String(this.charElements.length),
    }).forEach(([name, value]) => this.rootElement.style.setProperty(name, value));
    [...this.rootElement.querySelectorAll(':scope > :not([data-word]) [data-char][data-whitespace]')].forEach(whitespace => {
      if (window.getComputedStyle(whitespace).getPropertyValue('display') !== 'inline') {
        whitespace.innerHTML = '&nbsp;';
      }
    });
    this.rootElement.setAttribute('data-text-splitter-initialized', '');
  }

  private nobr(node = this.fragment as unknown as ChildNode): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent!;
      const matches = [...text.matchAll(NOBR_REGEXP)];
      if (!matches.length) {
        return;
      }
      let index = 0;
      matches.forEach(match => {
        const offset = match.index;
        if (offset > index) {
          node.before(text.slice(index, offset));
        }
        const span = document.createElement('span');
        span.setAttribute('data-_nobr', '');
        const matched = match[0];
        span.textContent = matched;
        node.before(span);
        index = offset + matched.length;
      });
      if (index < text.length) {
        node.before(text.slice(index));
      }
      node.remove();
    } else if (node.hasChildNodes()) {
      [...node.childNodes].forEach(node => this.nobr(node as HTMLElement));
    }
  }

  private split(by: 'word' | 'char', node = this.fragment as unknown as ChildNode): void {
    const items = this[`${by}Elements`];
    [...node.childNodes].forEach(node => {
      const text = node.textContent!;
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentNode!;
        const segments = [
          ...new Intl.Segmenter(
            (((parent.nodeType === Node.ELEMENT_NODE ? parent : this.rootElement) as HTMLElement).closest('[lang]') as HTMLElement)?.lang || document.documentElement.lang || 'en',
            by === 'word' && this.settings.wordSegmenter
              ? {
                  granularity: 'word',
                }
              : {},
          ).segment(text.replace(/[\r\n\t]/g, '').replace(/\s{2,}/g, ' ')),
        ];
        segments.forEach(segment => {
          const span = document.createElement('span');
          const text = segment.segment || ' ';
          [by, segment.segment.charCodeAt(0) === 32 && 'whitespace'].filter(Boolean).forEach(type => span.setAttribute(`data-${type}`, type !== 'whitespace' ? text : ''));
          span.textContent = text;
          items.push(span);
          node.before(span);
        });
        node.remove();
      } else if (by === 'word' && node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).hasAttribute('data-_nobr')) {
        (node as HTMLElement).removeAttribute('data-_nobr');
        (node as HTMLElement).setAttribute('data-word', text);
        items.push(node as HTMLElement);
      } else if (node.hasChildNodes()) {
        this.split(by, node);
      }
    });
  }

  private lbr(by: 'word' | 'char'): void {
    const items = this[`${by}Elements`];
    let previous = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const text = item.textContent!;
      if (previous && previous.textContent!.trim() && LBR_PROHIBIT_START_REGEXP.test([...new Intl.Segmenter((item.closest('[lang]') as HTMLElement)?.lang || document.documentElement.lang || 'en').segment(text)].shift()!.segment)) {
        previous.setAttribute(`data-${by}`, (previous.textContent += text));
        item.remove();
        items.splice(i, 1);
        i--;
      } else {
        previous = item;
      }
    }
    function concat(item: HTMLElement, regexp: RegExp, index: number): void {
      const offset = index + 1;
      let next = items[offset];
      let text: string;
      while (next && regexp.test((text = next.textContent!))) {
        item.setAttribute(`data-${by}`, (item.textContent += text));
        next.remove();
        items.splice(offset, 1);
        next = items[offset];
      }
    }
    items.forEach((item, i) => {
      if (LBR_PROHIBIT_END_REGEXP.test(item.textContent!)) {
        concat(item, LBR_PROHIBIT_END_REGEXP, i);
        const next = items[i + 1];
        const text = next?.textContent!;
        if (next && text.trim()) {
          next.setAttribute(`data-${by}`, (next.textContent = item.textContent + text));
          item.remove();
          items.splice(i, 1);
        }
      }
    });
    items.forEach((item, i) => {
      if (LBR_INSEPARATABLE_REGEXP.test(item.textContent!)) {
        concat(item, LBR_INSEPARATABLE_REGEXP, i);
      }
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

  destroy(): void {
    this.rootElement.removeAttribute('data-text-splitter-initialized');
    ['--word-length', '--char-length'].forEach(name => this.rootElement.style.removeProperty(name));
    this.rootElement.innerHTML = this.original;
  }
}
