import { AssociateRecord } from './parser';

export interface TxtParseOptions {
  category?: 'normal' | 'pensionista';
  contractFormat?: 'full' | 'short' | 'code';
}

export interface TxtParseResult {
  records: (AssociateRecord & {
    rawCpf?: string;
    rubrica?: string;
    situacao?: string;
    contractFull?: string;
    contractShort?: string;
    contractCode?: string;
    lineNumber?: number;
    rawLine?: string;
  })[];
  ignoredLines: { line: number; text: string; reason: string }[];
  totalValue: number;
}

/**
 * Parses fixed-width SIAPE / SERPRO text files (.txt) into structured AssociateRecords.
 * Supports both Normal (Ativos/Aposentados) and Pensionistas (com 2 SIAPEs).
 *
 * Normal format:
 * - 00..05: Órgão / UPAG (26279 - UFPI)
 * - 05..12: Matrícula SIAPE (7 dígitos)
 * - 12..23: Identificador (000000056PI) -> 'PI' no índice 21
 * - 23..73: Nome (50 caracteres)
 * - 73..84: CPF (11 dígitos)
 * - 84..90: Rubrica (346661)
 * - 90..101: Valor em centavos (ex: 00000008524 -> R$ 85,24)
 * - 101..110: Código numérico
 * - 110..122: Situação funcional (ex: ESTAVEL)
 * - 122..fim: Dados adicionais contendo contrato (ex: Y346661-369330Z)
 *
 * Pensionistas format:
 * - 00..05: Órgão / UPAG (26279 - UFPI)
 * - 05..12: SIAPE 1 (7 dígitos)
 * - 12..20: SIAPE 2 / Instituidor (8 dígitos)
 * - 20..31: Identificador (000000056PI) -> 'PI' no índice 29
 * - 31..76: Nome (45 caracteres)
 * - 76..87: CPF (11 dígitos)
 * - 87..93: Rubrica (346661)
 * - 93..104: Valor em centavos (ex: 00000003889 -> R$ 38,89)
 * - 104..113: Código numérico (000154048)
 * - 113..125: Situação (ex: NAO ESTAVEL)
 * - 125..fim: Dados adicionais contendo contrato (ex: Y346661-371202Z ou Y00-93983Z)
 */
export function parseTxtContent(content: string, options: TxtParseOptions = {}): TxtParseResult {
  const lines = content.split(/\r?\n/);
  const records: TxtParseResult['records'] = [];
  const ignoredLines: TxtParseResult['ignoredLines'] = [];
  let totalValue = 0;

  const contractFormat = options.contractFormat || 'full';
  const categoryOption = options.category;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      continue; // Skip empty lines silently
    }

    // Must be a substantial data line
    if (trimmed.length >= 90) {
      const piIdx = trimmed.indexOf('PI');
      const isPensionistaLine = categoryOption === 'pensionista' || piIdx === 29;

      let siape = '';
      let siape2: string | undefined = undefined;
      let name = '';
      let rawCpf = '';
      let rubrica = '';
      let valRaw = '';
      let code1 = '';
      let situacao = '';
      let afterSituacao = '';

      if (isPensionistaLine && (piIdx === 29 || categoryOption === 'pensionista')) {
        // Pensionista line layout
        siape = trimmed.substring(5, 12).trim();
        siape2 = trimmed.substring(12, 20).trim();
        name = trimmed.substring(31, 76).trim();
        rawCpf = trimmed.substring(76, 87).trim();
        rubrica = trimmed.substring(87, 93).trim();
        valRaw = trimmed.substring(93, 104).trim();
        code1 = trimmed.substring(104, 113).trim();
        situacao = trimmed.substring(113, 125).trim();
        afterSituacao = trimmed.substring(125).trim();
      } else {
        // Normal (Ativos / Aposentados) layout
        siape = trimmed.substring(5, 12).trim();
        name = trimmed.substring(23, 73).trim();
        rawCpf = trimmed.substring(73, 84).trim();
        rubrica = trimmed.substring(84, 90).trim();
        valRaw = trimmed.substring(90, 101).trim();
        code1 = trimmed.substring(101, 110).trim();
        situacao = trimmed.substring(110, 122).trim();
        afterSituacao = trimmed.substring(122).trim();
      }

      // Value extraction (cents to float)
      const rawNumericVal = parseInt(valRaw, 10);
      const value = !isNaN(rawNumericVal) ? rawNumericVal / 100 : 0;

      // Format CPF to 000.000.000-00
      let formattedCpf = rawCpf;
      if (/^\d{11}$/.test(rawCpf)) {
        formattedCpf = `${rawCpf.substring(0, 3)}.${rawCpf.substring(3, 6)}.${rawCpf.substring(6, 9)}-${rawCpf.substring(9, 11)}`;
      }

      // Contract extraction
      // Can match patterns like Y346661-371202Z, Y00-93983Z, 446661-368493, 00-25986
      const contractMatch = afterSituacao.match(/[A-Z]?([0-9]{2,6}-[0-9]{5,6})[A-Z]?/);
      const contractFull = contractMatch ? contractMatch[1] : code1;
      const contractShort = contractMatch ? contractMatch[1].split('-')[1] : code1;
      const contractCode = code1.replace(/^0+/, '') || code1;

      let chosenContract = contractFull;
      if (contractFormat === 'short') {
        chosenContract = contractShort;
      } else if (contractFormat === 'code') {
        chosenContract = contractCode;
      }

      // Valid associate check: must have name, siape, and 11-digit CPF
      if (name && siape && rawCpf.length === 11) {
        records.push({
          siape,
          siape2,
          name,
          cpf: formattedCpf,
          rawCpf,
          value,
          contract: chosenContract,
          pensionista: isPensionistaLine,
          rubrica,
          situacao,
          contractFull,
          contractShort,
          contractCode,
          lineNumber: i + 1,
          rawLine: trimmed,
          raw: trimmed
        });
        totalValue += value;
        continue;
      }
    }

    // Ignored lines (Header, Trailer, etc.)
    ignoredLines.push({
      line: i + 1,
      text: trimmed.length > 80 ? trimmed.substring(0, 80) + '...' : trimmed,
      reason: trimmed.startsWith('1') || trimmed.startsWith('9') 
        ? 'Cabeçalho ou Rodapé do arquivo' 
        : 'Linha com formato não compatível com dados de associado'
    });
  }

  return {
    records,
    ignoredLines,
    totalValue: Math.round(totalValue * 100) / 100
  };
}
