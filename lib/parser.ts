import * as XLSX from 'xlsx';
import { parseTxtContent } from './txtParser';

export interface AssociateRecord {
  siape: string;
  siape2?: string;
  name: string;
  cpf: string;
  value: number;
  contract: string;
  pensionista: boolean;
  raw?: any;
}

export async function parseFile(file: File, category: string): Promise<AssociateRecord[]> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
    return parseExcel(file, category);
  } else if (extension === 'txt') {
    return parseTxtFile(file, category);
  } else {
    throw new Error('Formato de arquivo não suportado. Use Excel (.xlsx, .xls), CSV ou TXT (.txt).');
  }
}

const cleanValue = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/R\$\s?/gi, '').replace(/\s+/g, '');
  if (!str) return 0;
  
  // If string contains comma, Brazilian format: thousand dots, comma decimal (e.g. "1.234,56" or "57,41")
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};

interface ExcelColumnMap {
  siapeIdx: number;
  siape2Idx: number;
  nameIdx: number;
  cpfIdx: number;
  valueIdx: number;
  contractIdx: number;
}

function detectColumns(headerRow: any[], category: string): ExcelColumnMap {
  let siapeIdx = -1;
  let siape2Idx = -1;
  let nameIdx = -1;
  let cpfIdx = -1;
  let valueIdx = -1;
  let contractIdx = -1;

  headerRow.forEach((cell, idx) => {
    if (cell === null || cell === undefined) return;
    const txt = String(cell).trim().toUpperCase();
    if (!txt) return;

    // Check Instituidor / SIAPE 2 first
    if (/INSTITUIDOR|SIAPE\s*2|SIAPE2|MATR.*INST/i.test(txt)) {
      siape2Idx = idx;
    } else if (/SIAPE|MATR/i.test(txt) && siapeIdx === -1) {
      siapeIdx = idx;
    }

    if (/NOME|ASSOCIADO|BENEFICI[AÁ]RI|SERVIDOR/i.test(txt) && nameIdx === -1) {
      nameIdx = idx;
    }

    if (/CPF/i.test(txt) && cpfIdx === -1) {
      cpfIdx = idx;
    }

    if (/VALOR|MENSALIDADE|DESCONTO|VAL\.|CONTRIBUI|L[IÍ]QUIDO|BRUTO/i.test(txt) && valueIdx === -1) {
      valueIdx = idx;
    }

    if (/CONTRATO|ADES[AÃ]O|RUBRICA/i.test(txt) && contractIdx === -1) {
      contractIdx = idx;
    }
  });

  // Fallbacks if not detected by header text
  if (category === 'pensionista') {
    if (siapeIdx === -1) siapeIdx = 0;
    if (siape2Idx === -1) siape2Idx = 1;
    if (nameIdx === -1) nameIdx = 2;
    if (cpfIdx === -1) cpfIdx = 3;
    if (valueIdx === -1) valueIdx = 5;
    if (contractIdx === -1) contractIdx = 6;
  } else {
    if (siapeIdx === -1) siapeIdx = 0;
    if (nameIdx === -1) nameIdx = 1;
    if (cpfIdx === -1) cpfIdx = 2;
    if (valueIdx === -1) valueIdx = 4;
    if (contractIdx === -1) contractIdx = 5;
  }

  return { siapeIdx, siape2Idx, nameIdx, cpfIdx, valueIdx, contractIdx };
}

async function parseExcel(file: File, category: string): Promise<AssociateRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (!rows || rows.length === 0) {
          resolve([]);
          return;
        }
        
        // Find header row (usually contains 'SIAPE' or 'NOME' or 'CPF' or 'VALOR')
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
          const rowStr = JSON.stringify(rows[i] || []).toUpperCase();
          if (
            (rowStr.includes('SIAPE') && rowStr.includes('NOME')) ||
            (rowStr.includes('NOME') && (rowStr.includes('CPF') || rowStr.includes('VALOR')))
          ) {
            headerRowIdx = i;
            break;
          }
        }
        
        const colMap = headerRowIdx !== -1 
          ? detectColumns(rows[headerRowIdx], category)
          : detectColumns([], category);

        const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

        const rawRecords = rows.slice(startIdx).map((row: any[]) => {
          if (!row || row.length === 0) return null;
          
          const name = String(row[colMap.nameIdx] || '').trim();
          const siape = String(row[colMap.siapeIdx] || '').trim();
          const cpf = String(row[colMap.cpfIdx] || '').trim();
          const value = cleanValue(row[colMap.valueIdx]);
          const contract = String(row[colMap.contractIdx] || '').trim();

          // Skip empty or header repetition rows
          if (!name && !siape) return null;
          if (name.toUpperCase().includes('NOME') && cpf.toUpperCase().includes('CPF')) return null;

          if (category === 'pensionista') {
            const siape2 = colMap.siape2Idx !== -1 ? String(row[colMap.siape2Idx] || '').trim() : '';
            return {
              siape,
              siape2,
              name,
              cpf,
              value,
              contract,
              pensionista: true,
              raw: row
            } as AssociateRecord;
          } else {
            return {
              siape,
              name,
              cpf,
              value,
              contract,
              pensionista: false,
              raw: row
            } as AssociateRecord;
          }
        });

        const records = rawRecords.filter((r): r is AssociateRecord => 
          r !== null && r.name !== 'undefined' && r.name !== ''
        );

        resolve(records);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

async function parseTxtFile(file: File, category: string): Promise<AssociateRecord[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = String(e.target?.result || '');
        const res = parseTxtContent(content, { 
          category: category as 'normal' | 'pensionista',
          contractFormat: 'full' 
        });

        if (res.records.length === 0) {
          throw new Error('Nenhum associado válido foi encontrado nas linhas do arquivo TXT. Verifique o formato posicional do arquivo.');
        }

        resolve(res.records);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
