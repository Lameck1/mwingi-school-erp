import { Database } from 'better-sqlite3'

export const fixCurrencyScale = (db: Database) => {
    // 1. Fee Structure
    db.prepare('UPDATE fee_structure SET amount = amount * 100').run()

    // 2. Fee Invoices
    db.prepare('UPDATE fee_invoice SET total_amount = total_amount * 100, amount_paid = amount_paid * 100').run()

    // 3. Invoice Items
    db.prepare(`
        UPDATE invoice_item 
        SET amount = amount * 100, 
            original_amount = original_amount * 100, 
            exemption_amount = exemption_amount * 100
    `).run()

    // 4. Ledger Transactions
    db.prepare('UPDATE ledger_transaction SET amount = amount * 100').run()

    // 5. Receipts
    db.prepare('UPDATE receipt SET amount = amount * 100').run()

    // 6. Student Credit Balance
    db.prepare('UPDATE student SET credit_balance = credit_balance * 100').run()

    // 7. Hire Payments (if any exists from previous task, though likely new)
    try {
        db.prepare('UPDATE hire_payment SET amount = amount * 100').run()
        db.prepare('UPDATE hire_pricing SET price = price * 100, deposit = deposit * 100').run()
    } catch (e) {
        // Tables might not exist or be populated yet, safe to ignore
    }
}
