import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';

// Verbose mode for detailed logging
const sqlite = sqlite3.verbose();

// Define the database path (e.g., in the app's user data directory)
const dbPath = path.join(app.getPath('userData'), 'projects.db');
let db: sqlite3.Database | null = null;

// Function to initialize the database
export const initDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    db = new sqlite.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
      } else {
        console.log('Connected to the SQLite database.');
        // Create the projects table if it doesn't exist
        db?.run(`CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          folderPath TEXT NOT NULL UNIQUE,
          name TEXT,
          lastAccessed DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) {
            console.error('Error creating projects table:', err.message);
            reject(err);
          } else {
            console.log('Projects table checked/created successfully.');
            resolve();
          }
        });
      }
    });
  });
};

// Function to add a project (folder path)
export const addProject = (folderPath: string, name?: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized.'));
    }
    const projectName = name || path.basename(folderPath);
    const sql = `INSERT OR IGNORE INTO projects (folderPath, name, lastAccessed) VALUES (?, ?, ?)`;
    db.run(sql, [folderPath, projectName, new Date().toISOString()], function(err) {
      if (err) {
        console.error('Error adding project:', err.message);
        reject(err);
      } else {
        // If inserted, this.lastID is the new row id. If ignored, it might be 0.
        // We might want to fetch the ID if it was ignored.
        if (this.lastID > 0) {
             console.log(`Project added/updated with ID: ${this.lastID}`);
             resolve(this.lastID);
        } else {
            // If ignored, fetch the existing project ID
            getProjectByPath(folderPath).then(project => {
                if (project) {
                    updateProjectAccessTime(project.id).then(() => resolve(project.id)).catch(reject);
                } else {
                    reject(new Error('Failed to add or find project.'));
                }
            }).catch(reject);
        }
      }
    });
  });
};

// Function to get a project by its path
export const getProjectByPath = (folderPath: string): Promise<{ id: number; folderPath: string; name: string; lastAccessed: string } | null> => {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database not initialized.'));
        }
        const sql = `SELECT * FROM projects WHERE folderPath = ?`;
        db.get(sql, [folderPath], (err, row: any) => {
            if (err) {
                console.error('Error fetching project by path:', err.message);
                reject(err);
            } else {
                resolve(row || null);
            }
        });
    });
};


// Function to update the last accessed time of a project
export const updateProjectAccessTime = (id: number): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database not initialized.'));
        }
        const sql = `UPDATE projects SET lastAccessed = ? WHERE id = ?`;
        db.run(sql, [new Date().toISOString(), id], (err) => {
            if (err) {
                console.error('Error updating project access time:', err.message);
                reject(err);
            } else {
                console.log(`Updated access time for project ID: ${id}`);
                resolve();
            }
        });
    });
};


// Function to get all projects, ordered by last accessed
export const getAllProjects = (): Promise<{ id: number; folderPath: string; name: string; lastAccessed: string }[]> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized.'));
    }
    const sql = `SELECT * FROM projects ORDER BY lastAccessed DESC`;
    db.all(sql, [], (err, rows: any[]) => {
      if (err) {
        console.error('Error fetching all projects:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Function to close the database connection
export const closeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return resolve(); // Nothing to close
    }
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
        reject(err);
      } else {
        console.log('Database connection closed.');
        db = null;
        resolve();
      }
    });
  });
};

// Ensure database is closed when the app quits
app.on('will-quit', async () => {
  await closeDatabase();
});