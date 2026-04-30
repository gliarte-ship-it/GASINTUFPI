import * as XLSX from 'xlsx';

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
  } else {
    throw new Error('Formato de arquivo não suportado. Use Excel (.xlsx, .xls) ou CSV.');
  }
}

const cleanValue = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  let str = String(val).trim().replace(/[R$\s.]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
};

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
        
        // Find header row (usually contains 'SIAPE' or 'NOME')
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const rowStr = JSON.stringify(rows[i]).toUpperCase();
          if (rowStr.includes('SIAPE') && rowStr.includes('NOME')) {
            headerRowIdx = i;
            break;
          }
        }
        
        const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

        const rawRecords = rows.slice(startIdx).map((row: any[]) => {
          if (!row || row.length === 0) return null;
          
          if (category === 'pensionista') {
            // A: SIAPE 1(0), B: SIAPE 2(1), C: Nome(2), D: CPF(3), E: (Pular), F: Valor em Reais(5), G: Contrato(6)
            const value = cleanValue(row[5]);
            const siape = String(row[0] || '').trim();
            if (!siape && !row[2]) return null; // Skip empty rows

            return {
              siape,
              siape2: String(row[1] || '').trim(),
              name: String(row[2] || '').trim(),
              cpf: String(row[3] || '').trim(),
              value,
              contract: String(row[6] || '').trim(),
              pensionista: true,
              raw: row
            } as AssociateRecord;
          } else {
            // Normal: A: SIAPE(0), B: Nome(1), C: CPF(2), D: (Pular), E: Valor em Reais(4), F: Contrato(5)
            const value = cleanValue(row[4]);
            const siape = String(row[0] || '').trim();
            if (!siape && !row[1]) return null; // Skip empty rows

            return {
              siape,
              name: String(row[1] || '').trim(),
              cpf: String(row[2] || '').trim(),
              value,
              contract: String(row[5] || '').trim(),
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
