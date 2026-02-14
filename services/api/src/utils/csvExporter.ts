import { Readable } from 'stream';

/**
 * Column definition for CSV export
 */
export interface CSVColumn {
  header: string;
  accessor: string | ((row: any) => any);
  formatter?: (value: any) => string;
}

/**
 * Escape CSV field values
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Generate CSV from data rows
 * @param columns Column definitions
 * @param data Array of data rows
 * @returns Readable stream of CSV content
 */
export function generateCSV(columns: CSVColumn[], data: any[]): Readable {
  const stream = new Readable();
  stream._read = () => {}; // No-op

  // UTF-8 BOM for Excel compatibility
  stream.push('\uFEFF');

  // Header row
  const headers = columns.map(col => escapeCSVValue(col.header)).join(',');
  stream.push(headers + '\n');

  // Data rows
  for (const row of data) {
    const values = columns.map(col => {
      let value: any;
      
      // Get value using accessor
      if (typeof col.accessor === 'function') {
        value = col.accessor(row);
      } else {
        value = row[col.accessor];
      }
      
      // Apply formatter if provided
      if (col.formatter && value !== null && value !== undefined) {
        value = col.formatter(value);
      }
      
      return escapeCSVValue(value);
    });
    
    stream.push(values.join(',') + '\n');
  }

  // End stream
  stream.push(null);
  
  return stream;
}

/**
 * Generate CSV from data rows (streaming version for large datasets)
 * @param columns Column definitions
 * @param dataGenerator Async generator that yields data rows
 * @returns Readable stream of CSV content
 */
export async function generateCSVStream(
  columns: CSVColumn[],
  dataGenerator: AsyncGenerator<any, void, unknown>
): Promise<Readable> {
  const stream = new Readable();
  stream._read = () => {}; // No-op

  // UTF-8 BOM
  stream.push('\uFEFF');

  // Header row
  const headers = columns.map(col => escapeCSVValue(col.header)).join(',');
  stream.push(headers + '\n');

  // Data rows (streamed)
  for await (const row of dataGenerator) {
    const values = columns.map(col => {
      let value: any;
      
      if (typeof col.accessor === 'function') {
        value = col.accessor(row);
      } else {
        value = row[col.accessor];
      }
      
      if (col.formatter && value !== null && value !== undefined) {
        value = col.formatter(value);
      }
      
      return escapeCSVValue(value);
    });
    
    stream.push(values.join(',') + '\n');
  }

  // End stream
  stream.push(null);
  
  return stream;
}

/**
 * Format date for CSV export
 */
export function formatDate(date: Date | string): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Format percentage for CSV export
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format duration (seconds) for CSV export
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
