# Importing a CSV file

**Settings › Your data › Import a file** reads a CSV from a bank, another finance app or a spreadsheet (IMP-02, DAT-12). This page lists what the import understands, for anyone preparing a file by hand or with a script. The file is read on the device and never leaves it unencrypted.

## The file

- One header row, then one row per transaction.
- The separator can be a comma, semicolon, tab or `|`. Mirador picks the one that splits every line the same way. Cells with the separator, quotes or line breaks go in double quotes, as Excel writes them.
- UTF-8, with or without a byte order mark.

## Columns

Mirador guesses each column from its header, in English or Spanish, without regard to case or accents. Every guess can be changed in the first step, and the choice is remembered for files with the same header (IMP-03). A header it doesn't know is skipped.

| Field | Headers it recognizes | What goes in it |
| --- | --- | --- |
| Date (required) | Date, Fecha, Day, Posted | A date such as `2026-10-19`, `19/10/2026` or `10/19/26`. Mirador works out day-first or month-first from the whole column, and the person can change it. |
| Amount (required, or Inflow and Outflow) | Amount, Monto, Importe, Cantidad, Value, Total | `-125.50`, `125,50`, `$1,234.00`, `(12.00)` or `12.00-`. By default a negative amount is an expense, which can be flipped for files that write expenses as positive. |
| Inflow, Outflow | Inflow, Credit, Deposit, Abono, Ingreso / Outflow, Debit, Withdrawal, Cargo, Retiro | Two columns instead of one signed amount. |
| Type | Type, Tipo, Kind | `expense`, `gasto`, `income`, `ingreso`, `transfer` or `transferencia`. An expense always takes money out and income always puts it in, whatever the sign. A transfer row keeps its sign: negative on the side the money left, positive on the side it reached. |
| Transfer ID | Transfer ID, Transfer pair, Pair ID, ID de transferencia | Any text, the same on both rows of one transfer, such as `T-1`. See [Transfers](#transfers). |
| Wallet | Wallet, Account, Cuenta, Cartera, Card, Tarjeta | The wallet's name. Names that match one of yours go there; the rest become new wallets, which the person reviews. A file without this column goes into one wallet the person picks. |
| Category | Category, Categoría, Subcategory | The category's name, matched to yours or created new. |
| Category group | Category group, Head category, Group, Grupo, Parent category | The group a new category goes in. |
| Tags | Tags, Tag, Etiquetas, Labels | Several tags separated by `,`, `;`, `|` or `#`. |
| Payee | Payee, Merchant, Description, Concepto, Comercio, Name | Who was paid. A row without a category gets the one this payee had last time (IMP-23). |
| Note | Note, Notes, Nota, Memo, Comment | Any text. |
| Currency | Currency, Moneda, Divisa | A code such as `MXN` or `USD`. It has to match its wallet's currency. Without this column, rows are in the wallet's currency. |

Balance, Saldo, Id and Reference columns are skipped.

## What happens to each row

The review step shows how many rows fall in each group before anything is saved:

- **Ready**: imported as an expense or income.
- **Already here** (IMP-20): the same wallet already has a transaction for the same amount within three days, from an earlier import. It is skipped unless the person keeps it.
- **Merged** (IMP-21): it matches a transaction the person entered by hand. That transaction keeps its category and note and takes the file's date.
- **Transfer** (IMP-22): two rows that are one move of money between wallets. They are saved as one transfer, and the person can keep them apart. See [Transfers](#transfers).
- **No category** (IMP-31): imported as Uncategorized unless the person picks one.
- **Can't read** (IMP-10): a date, amount or currency that isn't one, or an amount of zero. These rows are left out and listed on the import, so they can be fixed in the file and imported again.

## Transfers

A CSV writes a transfer as two rows: money out of one wallet and money into another. Mirador pairs them into one transfer (IMP-22), trusting what the file says before guessing:

1. **Same transfer ID.** Two rows with the same Transfer ID, one negative and one positive, in two different wallets, are one transfer, whatever their dates. A row with an ID only ever pairs with the other row that has it. An ID on a single row, or on two rows that don't go out of one wallet and into another, isn't paired: the row is imported as an expense or income, or put to the person when it has no category. An ID on more than two rows only marks them as transfers, as in step 2.
2. **Marked as transfers.** Rows whose Type is `transfer`, or whose category is a transfer such as Transfer, Traspaso or Credit card payment, pair with each other: the same amount out of one wallet and into another, within three days, the closest dates first.
3. **Everything left**, only in a file with no Type or Transfer ID column: the same amount out of one wallet and into another within three days is offered as a possible transfer. It is paired by default when one of the two rows is marked as a transfer, and kept apart otherwise.

A row the Type column calls an expense or income is never paired, and in a file with a Type or Transfer ID column, rows it doesn't mark as transfers stay as they are. So an expense on the same day and for the same amount as a transfer can't take one side of the transfer's place.

The clearest file marks both sides:

```csv
Date,Wallet,Type,Transfer ID,Category,Amount
2026-12-20,Checking,expense,,Groceries,-1500.00
2026-12-20,Checking,transfer,T-1,,-1500.00
2026-12-20,Savings,transfer,T-1,,1500.00
```

## Undoing an import

Every import is listed under **Settings › Your data › Imports** with its counts and the rows left out. Undoing one removes exactly what it added: its transactions, plus the wallets, categories, tags and payees it created that nothing else uses. Transactions it merged get their old date back (IMP-35). Importing the same file a second time asks first (IMP-36).

## Tips for preparing a file

- To move everything between Mirador accounts, use the backup file ([archive-format.md](archive-format.md)), not a CSV.
- The spreadsheet Mirador exports (DAT-02) uses these headers, so its expenses and income import back as they were. Each transfer is one row without its other side, so on the way back in it comes as a row without a category, to fix by hand.
- Add a Wallet column when the file mixes several cards or accounts, and a Category group column to put new categories in the right group.
- When converting another app's export by script, write a Type column and give both rows of each transfer the same Transfer ID, so no transfer is left to a guess.
