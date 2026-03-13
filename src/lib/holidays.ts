import { deleteSchoolHolidays, bulkCreateHolidays } from './db';

interface SchulferienEntry {
  name: string;
  start: string; // ISO date
  end: string;   // ISO date
}

/**
 * Holt Schulferien für Niedersachsen von schulferien-api.de
 * Aktuelles + nächstes Jahr
 */
export async function fetchSchoolHolidays(): Promise<{
  imported: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const allHolidays: Array<{
    name: string; date_start: string; date_end: string;
    type: string; status: string; source: string;
  }> = [];

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear + 1];

  for (const year of years) {
    try {
      const url = `https://schulferien-api.de/api/v1/${year}/NI/`;
      const res = await fetch(url);

      if (!res.ok) {
        errors.push(`API-Fehler für ${year}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json() as SchulferienEntry[];

      if (!Array.isArray(data)) {
        errors.push(`Unerwartetes Format für ${year}`);
        continue;
      }

      for (const entry of data) {
        const dateStart = entry.start?.slice(0, 10);
        const dateEnd = entry.end?.slice(0, 10);

        if (!dateStart || !dateEnd || !entry.name) {
          errors.push(`Unvollständiger Eintrag übersprungen: ${JSON.stringify(entry)}`);
          continue;
        }

        allHolidays.push({
          name: entry.name,
          date_start: dateStart,
          date_end: dateEnd,
          type: 'school',
          status: 'info',
          source: 'schulferien-api',
        });
      }
    } catch (err: any) {
      errors.push(`Netzwerk-Fehler für ${year}: ${err.message || err}`);
    }
  }

  if (allHolidays.length === 0 && errors.length > 0) {
    return { imported: 0, errors };
  }

  // Delete-and-Reimport: Nur type='school' wird gelöscht
  // Custom-Einträge bleiben unberührt
  try {
    deleteSchoolHolidays();
    bulkCreateHolidays(allHolidays);
  } catch (err: any) {
    errors.push(`DB-Fehler: ${err.message || err}`);
    return { imported: 0, errors };
  }

  return { imported: allHolidays.length, errors };
}
