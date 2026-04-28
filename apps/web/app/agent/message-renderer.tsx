import React, { type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { BlockMath, InlineMath } from 'react-katex';

export function renderLatexDocMessage(content: string): ReactNode {
  const sanitized = content
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\\n/g, '\n')
    .trim();
  const safeForMathParser = sanitized.replace(/(^|[^\\$])\$(?=(\d|[A-ZÁÉÍÓÚÑ]))/gm, '$1\\$');
  const stripEnclosingParens = (input: string) => {
    let expr = input.trim();
    const isBalanced = (s: string) => {
      let depth = 0;
      for (const ch of s) {
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth < 0) return false;
        }
      }
      return depth === 0;
    };
    while (expr.startsWith('(') && expr.endsWith(')')) {
      const candidate = expr.slice(1, -1).trim();
      if (!candidate || !isBalanced(candidate)) break;
      expr = candidate;
    }
    return expr;
  };
  const toFractionIfDivision = (rawExpr: string) => {
    let expr = rawExpr.trim();
    if (!expr.includes('/')) return expr;
    if (expr.includes('://')) return expr;
    const isTokenChar = (ch: string) => /[A-Za-z0-9_.\\^]/.test(ch);
    const findLeftOperandStart = (input: string, slashIndex: number) => {
      let i = slashIndex - 1;
      while (i >= 0 && /\s/.test(input[i])) i -= 1;
      if (i < 0) return 0;
      if (input[i] === ')' || input[i] === ']' || input[i] === '}') {
        const open = input[i] === ')' ? '(' : input[i] === ']' ? '[' : '{';
        const close = input[i];
        let depth = 1;
        i -= 1;
        while (i >= 0) {
          if (input[i] === close) depth += 1;
          else if (input[i] === open) {
            depth -= 1;
            if (depth === 0) return i;
          }
          i -= 1;
        }
        return 0;
      }
      while (i >= 0 && isTokenChar(input[i])) i -= 1;
      return i + 1;
    };
    const findRightOperandEnd = (input: string, slashIndex: number) => {
      let i = slashIndex + 1;
      while (i < input.length && /\s/.test(input[i])) i += 1;
      if (i >= input.length) return input.length;
      if (input[i] === '(' || input[i] === '[' || input[i] === '{') {
        const open = input[i];
        const close = open === '(' ? ')' : open === '[' ? ']' : '}';
        let depth = 1;
        i += 1;
        while (i < input.length) {
          if (input[i] === open) depth += 1;
          else if (input[i] === close) {
            depth -= 1;
            if (depth === 0) return i + 1;
          }
          i += 1;
        }
        return input.length;
      }
      while (i < input.length && isTokenChar(input[i])) i += 1;
      return i;
    };
    let guard = 0;
    while (guard < 8 && expr.includes('/')) {
      guard += 1;
      const slashIndex = expr.indexOf('/');
      if (slashIndex <= 0 || slashIndex >= expr.length - 1) break;
      if (expr[slashIndex + 1] === '/') {
        expr = `${expr.slice(0, slashIndex + 1)} ${expr.slice(slashIndex + 1)}`;
        continue;
      }
      const leftStart = findLeftOperandStart(expr, slashIndex);
      const rightEnd = findRightOperandEnd(expr, slashIndex);
      const left = stripEnclosingParens(expr.slice(leftStart, slashIndex));
      const right = stripEnclosingParens(expr.slice(slashIndex + 1, rightEnd));
      if (!left || !right) break;
      expr = `${expr.slice(0, leftStart)}\\frac{${left}}{${right}}${expr.slice(rightEnd)}`;
    }
    return expr;
  };
  const normalizeDivisionsToFractions = (line: string) => {
    const expr = line.trim();
    if (!expr.includes('/')) return expr;
    const parts = expr.split('=');
    if (parts.length === 1) return toFractionIfDivision(parts[0]);
    const normalizedParts = parts.map((part, idx) => (idx === 0 ? part.trim() : toFractionIfDivision(part)));
    return normalizedParts.join(' = ');
  };
  const normalizedForMath = safeForMathParser
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .replace(/\r\n/g, '\n');
  const compactMath = normalizedForMath.replace(/\$\$\s*([^$]+?)\s*\$\$/g, (_m, expr) => {
    const cleaned = expr.replace(/\s+/g, ' ').replace(/\[\s*/g, '\\left(').replace(/\s*\]/g, '\\right)').trim();
    return `$$${normalizeDivisionsToFractions(cleaned)}$$`;
  });
  const normalizeEscapedMarkdown = (input: string) =>
    (() => {
      let inFence = false;
      return input.split('\n').map((line) => {
        const raw = line;
        const trimmed = raw.trim();
        if (/^```/.test(trimmed)) { inFence = !inFence; return raw; }
        if (!trimmed || raw.includes('$$')) return raw;
        let next = raw;
        if (!inFence && /^ {4,}\S/.test(next)) next = next.replace(/^ {4}/, '');
        next = next.replace(/\\+([*_`#>\-])/g, '$1').replace(/\\+([“”"'])/g, '$1');
        next = next.replace(/^\s*[•●◦▪]\s+/u, '- ');
        next = next.replace(/\*\*\s+([^*][\s\S]*?)\s+\*\*/g, '$1').replace(/:\s*\*\s+(\d)/g, ': $1');
        let boldIndex = 0;
        const boldTokens: Array<{ key: string; value: string }> = [];
        next = next.replace(/\*\*([^*\n]+?)\*\*/g, (_m, content) => {
          const key = `@@BOLD_${boldIndex++}@@`; boldTokens.push({ key, value: content }); return key;
        });
        let italicIndex = 0;
        const italicTokens: Array<{ key: string; value: string }> = [];
        next = next.replace(/(^|[^\*])\*([^*\n]+?)\*(?!\*)/g, (_m, prefix, content) => {
          const key = `@@ITALIC_${italicIndex++}@@`; italicTokens.push({ key, value: `*${content}*` }); return `${prefix}${key}`;
        });
        next = next.replace(/\*\*/g, '');
        if (!next.includes('$')) next = next.replace(/([^\s*])\*(?!\*)(?=\s|$|[.,;:!?])/g, '$1');
        for (const token of boldTokens) next = next.replace(token.key, token.value);
        for (const token of italicTokens) next = next.replace(token.key, token.value);
        next = next.replace(/^\s*["“”']\s*(\*\*.+\*\*|#{1,6}\s+.+|-{3,})\s*["“”']\s*$/u, '$1');
        return next;
      }).join('\n');
    })();
  const markdownReady = normalizeEscapedMarkdown(compactMath);
  const polishedMarkdown = (() => {
    const normalized = markdownReady.replace(/\*\*\s+([^*\n][^*\n]*?)\s+\*\*/g, '$1');
    const mathTokens: Array<{ key: string; value: string }> = [];
    let mathIdx = 0;
    const withMathProtected = normalized.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g, (m) => {
      const key = `@@MATH_${mathIdx++}@@`; mathTokens.push({ key, value: m }); return key;
    });
    const boldTokens: Array<{ key: string; value: string }> = [];
    let boldIdx = 0;
    let text = withMathProtected.replace(/\*\*([^*\n]+?)\*\*/g, (_m, content) => {
      const key = `@@B_${boldIdx++}@@`; boldTokens.push({ key, value: content }); return key;
    });
    const italicTokens: Array<{ key: string; value: string }> = [];
    let italicIdx = 0;
    text = text.replace(/(^|[^\*])\*([^*\n]+?)\*(?!\*)/g, (_m, prefix, content) => {
      const key = `@@I_${italicIdx++}@@`; italicTokens.push({ key, value: `*${content}*` }); return `${prefix}${key}`;
    });
    text = text.replace(/\*\*/g, '').replace(/([^\s*])\*(?!\*)(?=\s|$|[.,;:!?])/g, '$1');
    for (const token of boldTokens) text = text.replace(token.key, token.value);
    for (const token of italicTokens) text = text.replace(token.key, token.value);
    for (const token of mathTokens) text = text.replace(token.key, token.value);
    return text;
  })();
  const promoteFormulaLikeLines = (input: string) => {
    let inFence = false;
    return input.split('\n').map((line) => {
      const raw = line;
      const trimmed = raw.trim();
      if (/^```/.test(trimmed)) { inFence = !inFence; return raw; }
      if (!trimmed || inFence || trimmed.includes('$$')) return raw;
      const bulletPrefix = raw.match(/^(\s*(?:[-*]|\d+\.)\s+)/)?.[1] ?? '';
      const body = bulletPrefix ? raw.slice(bulletPrefix.length).trim() : trimmed;
      const looksFormulaLike =
        /[=Σπμσ√∞∑]/u.test(body) ||
        /\b(?:VAN|VPN|TIR|IRR|WACC|CAPM|ROI|ROE|EBITDA|NPV|beta|alpha|ln|cov|var)\b/i.test(body) ||
        /[A-Za-z][A-Za-z0-9_]*\s*=\s*.+/.test(body) ||
        /\([^)]+\)\^[^\s]+/.test(body) ||
        /\bCF_t\b|\br_f\b|\br_m\b|\bP_final\b|\bP_inicial\b/.test(body);
      const proseHeavy = body.split(/\s+/).length > 18 && !/[=Σ∑]/u.test(body);
      if (!looksFormulaLike || proseHeavy) return raw;
      const formulaBody = body.replace(/\*\*/g, '').replace(/\bSigma\b/gi, '\\sum').replace(/Σ/g, '\\sum ').replace(/\bln\s*\(/g, '\\ln(').replace(/\bpi\b/gi, '\\pi ').replace(/\bmu\b/gi, '\\mu ').replace(/\bsigma\b/gi, '\\sigma ').trim();
      if (!formulaBody) return raw;
      return `${bulletPrefix}$$${normalizeDivisionsToFractions(formulaBody)}$$`;
    }).join('\n');
  };
  const refinedMarkdown = promoteFormulaLikeLines(polishedMarkdown)
    .split('\n')
    .map((line) => ((line.match(/\*\*/g)?.length ?? 0) % 2 === 1 ? line.replace(/\*\*/g, '') : line))
    .join('\n')
    .replace(/(^|[\s([{])\*\*(?=\s|$|[.,;:!?])/g, '$1')
    .replace(/\*\*(?=\s|$)/g, '');
  const markdownComponents = {
    h1: ({ node, ...props }: any) => <h1 className="md-h1" {...props} />,
    h2: ({ node, ...props }: any) => <h2 className="md-h2" {...props} />,
    h3: ({ node, ...props }: any) => <h3 className="md-h3" {...props} />,
    h4: ({ node, ...props }: any) => <h4 className="md-h4" {...props} />,
    h5: ({ node, ...props }: any) => <h5 className="md-h5" {...props} />,
    h6: ({ node, ...props }: any) => <h6 className="md-h6" {...props} />,
    p: ({ node, ...props }: any) => <p className="md-paragraph" {...props} />,
    strong: ({ node, ...props }: any) => <strong className="md-bold" {...props} />,
    em: ({ node, ...props }: any) => <em className="md-italic" {...props} />,
    code: ({ node, inline, ...props }: any) => (inline ? <code className="md-code" {...props} /> : <code className="md-code-block" {...props} />),
    a: ({ node, ...props }: any) => <a className="md-link" {...props} />,
    ul: ({ node, ...props }: any) => <ul className="md-list" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="md-list-ordered" {...props} />,
    li: ({ node, ...props }: any) => <li className="md-list-item" {...props} />,
    blockquote: ({ node, ...props }: any) => <blockquote className="md-blockquote" {...props} />,
    table: ({ node, ...props }: any) => <table className="md-table" {...props} />,
    math: ({ node, value }: any) => <BlockMath math={value} errorColor="#d7e6f5" />,
    inlineMath: ({ node, value }: any) => <InlineMath math={value} errorColor="#d7e6f5" />,
  };
  const hasBlockMath = /\$\$[\s\S]+?\$\$/.test(refinedMarkdown);
  if (hasBlockMath) {
    const nodes: ReactNode[] = [];
    const blockMathRegex = /\$\$([\s\S]+?)\$\$/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let segmentIndex = 0;
    while ((match = blockMathRegex.exec(refinedMarkdown)) !== null) {
      const before = refinedMarkdown.slice(lastIndex, match.index).trim();
      if (before) {
        nodes.push(<ReactMarkdown key={`md-before-${segmentIndex}`} remarkPlugins={[[remarkMath, { singleDollarTextMath: false }], remarkGfm]} components={markdownComponents}>{before}</ReactMarkdown>);
        segmentIndex += 1;
      }
      const expr = match[1]?.trim();
      if (expr) {
        nodes.push(<div key={`math-${segmentIndex}`} className="md-math-block"><BlockMath math={expr} errorColor="#d7e6f5" /></div>);
        segmentIndex += 1;
      }
      lastIndex = match.index + match[0].length;
    }
    const tail = refinedMarkdown.slice(lastIndex).trim();
    if (tail) nodes.push(<ReactMarkdown key={`md-tail-${segmentIndex}`} remarkPlugins={[[remarkMath, { singleDollarTextMath: false }], remarkGfm]} components={markdownComponents}>{tail}</ReactMarkdown>);
    return <div className="markdown-content premium-markdown academic-paper">{nodes}</div>;
  }
  return (
    <div className="markdown-content premium-markdown academic-paper">
      <ReactMarkdown remarkPlugins={[[remarkMath, { singleDollarTextMath: false }], remarkGfm]} components={markdownComponents}>
        {refinedMarkdown}
      </ReactMarkdown>
    </div>
  );
}
