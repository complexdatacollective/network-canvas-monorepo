export default async function parseCSV<T>(csvFile: File): Promise<T[]> {
  const { parse } = await import('papaparse');
  return new Promise((resolve, reject) => {
    parse<T>(csvFile, {
      skipEmptyLines: true,
      header: true,
      error: (error) => {
        reject(error);
      },
      complete: (results) => {
        resolve(results.data);
      },
    });
  });
}
