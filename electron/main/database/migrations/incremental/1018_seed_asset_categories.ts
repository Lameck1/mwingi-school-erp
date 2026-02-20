import type { Database } from 'better-sqlite3'

export function up(db: Database): void {
    const categories = [
        { name: 'Furniture & Fittings', method: 'STRAIGHT_LINE', life: 10, rate: 10.0 },
        { name: 'Computer Equipment', method: 'DECLINING_BALANCE', life: 3, rate: 33.3 },
        { name: 'Vehicles', method: 'STRAIGHT_LINE', life: 5, rate: 20.0 },
        { name: 'Land & Buildings', method: 'STRAIGHT_LINE', life: 50, rate: 2.0 }
    ]

    const insert = db.prepare(`
    INSERT OR IGNORE INTO asset_category (category_name, depreciation_method, useful_life_years, depreciation_rate)
    VALUES (?, ?, ?, ?)
  `)

    for (const cat of categories) {
        insert.run(cat.name, cat.method, cat.life, cat.rate)
    }
}
