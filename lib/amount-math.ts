/**
 * Safely evaluate a simple arithmetic expression for transaction amounts.
 * Allows digits, whitespace, decimal points, + - * / and parentheses only.
 * Returns a positive finite number, or null if invalid.
 */
export function evaluateAmountExpression(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (!/^[\d\s.+\-*/()]+$/.test(trimmed)) return null;

  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return null;
    const parser = new Parser(tokens);
    const value = parser.parseExpression();
    if (!parser.atEnd()) return null;
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100) / 100;
  } catch {
    return null;
  }
}

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      const prev = tokens[tokens.length - 1];
      const isUnary =
        ch === '-' &&
        (tokens.length === 0 ||
          prev?.kind === 'op' ||
          prev?.kind === 'lparen');

      if (isUnary) {
        // Fold unary minus into the following number if possible
        let j = i + 1;
        while (j < input.length && /\s/.test(input[j]!)) j += 1;
        if (j < input.length && /[\d.]/.test(input[j]!)) {
          const { value, next } = readNumber(input, j);
          tokens.push({ kind: 'number', value: -value });
          i = next;
          continue;
        }
      }

      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }

    if (/[\d.]/.test(ch)) {
      const { value, next } = readNumber(input, i);
      tokens.push({ kind: 'number', value });
      i = next;
      continue;
    }

    throw new Error('Unexpected character');
  }

  return tokens;
}

function readNumber(input: string, start: number): { value: number; next: number } {
  let i = start;
  let sawDot = false;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === '.') {
      if (sawDot) break;
      sawDot = true;
      i += 1;
      continue;
    }
    if (/\d/.test(ch)) {
      i += 1;
      continue;
    }
    break;
  }
  const raw = input.slice(start, i);
  if (raw === '.' || raw === '') throw new Error('Invalid number');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error('Invalid number');
  return { value, next: i };
}

class Parser {
  private index = 0;
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  atEnd() {
    return this.index >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private consume(): Token {
    const token = this.tokens[this.index];
    if (!token) throw new Error('Unexpected end');
    this.index += 1;
    return token;
  }

  parseExpression(): number {
    let left = this.parseTerm();
    while (true) {
      const token = this.peek();
      if (!token || token.kind !== 'op' || (token.value !== '+' && token.value !== '-')) break;
      this.consume();
      const right = this.parseTerm();
      left = token.value === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    while (true) {
      const token = this.peek();
      if (!token || token.kind !== 'op' || (token.value !== '*' && token.value !== '/')) break;
      this.consume();
      const right = this.parseFactor();
      if (token.value === '/') {
        if (right === 0) throw new Error('Division by zero');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  private parseFactor(): number {
    const token = this.peek();
    if (!token) throw new Error('Unexpected end');

    if (token.kind === 'number') {
      this.consume();
      return token.value;
    }

    if (token.kind === 'lparen') {
      this.consume();
      const value = this.parseExpression();
      const close = this.consume();
      if (close.kind !== 'rparen') throw new Error('Expected )');
      return value;
    }

    throw new Error('Expected number or (');
  }
}
