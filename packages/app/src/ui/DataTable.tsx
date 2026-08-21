/**
 * A dense, comparable list.
 *
 * The primitive the app did not have. `ListItem` is a phone row — a primary line, a secondary
 * line and something trailing — and it is the right shape for browsing. It is the wrong shape
 * for *comparing*, which is what rankings, fight offers and promotion selection all actually
 * are, and the absence of an alternative is why those screens spend a 1920px display on a
 * 56rem column of two-line rows.
 *
 * The rule this encodes, from doc 32 § 7: **density scales up, never down.** A phone does not
 * get a truncated table; it gets a different component carrying the same data. So one set of
 * column definitions produces a real `<table>` above 62rem and a stack of rows below it, and a
 * column is marked with which of those it belongs to rather than each screen maintaining two
 * lists that drift.
 *
 * Semantic `<table>` rather than a grid of divs: a screen reader user navigating a ranking by
 * column, and hearing the header repeated with each cell, is the entire reason table semantics
 * exist. A div grid throws that away for nothing.
 */

import { useMemo, useState, type ReactNode } from 'react';
import './DataTable.css';

export interface Column<T> {
  /** Stable key. Also the sort key when `sort` is given. */
  id: string;
  /** Column header. Kept short — this is a header row, not a sentence. */
  label: string;
  /** The cell. */
  render(row: T): ReactNode;
  /**
   * How this column sorts, if it does. Returning `undefined` from `sort` on a column makes it
   * unsortable, which is right for a column of prose.
   */
  sort?(a: T, b: T): number;
  /** Right-align and use tabular numerals. For anything that is a quantity. */
  numeric?: boolean;
  /**
   * Where this column appears on a phone.
   *
   * `primary` — the row's headline. Exactly one column should be primary.
   * `secondary` — joined into the row's second line with the other secondaries.
   * `trailing` — right-hand side of the row, for a badge or a rating.
   * `hidden` — desktop only. Use for a column that genuinely does not survive the width.
   */
  onPhone?: 'primary' | 'secondary' | 'trailing' | 'hidden';
  /** Header-only hint for a column whose label has to be abbreviated. */
  title?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  /** Marks one row as the reader's own — their fighter in a ranking, their promotion in a list. */
  isCurrent,
  caption,
  empty,
  /** Column id to sort by initially. Without it, rows render in the order given. */
  defaultSort,
}: {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey(row: T): string;
  onRowClick?(row: T): void;
  isCurrent?(row: T): boolean;
  /** Describes the table for assistive tech. Visually hidden — the surrounding UI has a title. */
  caption: string;
  empty?: ReactNode;
  defaultSort?: string;
}) {
  const [sort, setSort] = useState<{ id: string; desc: boolean } | undefined>(
    defaultSort ? { id: defaultSort, desc: true } : undefined,
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sort) return rows;
    const compare = column.sort;
    return [...rows].sort((a, b) => (sort.desc ? compare(b, a) : compare(a, b)));
  }, [rows, columns, sort]);

  if (rows.length === 0 && empty) return <>{empty}</>;

  const toggle = (id: string) =>
    setSort((current) =>
      current?.id === id ? { id, desc: !current.desc } : { id, desc: true },
    );

  const phone = {
    primary: columns.find((c) => c.onPhone === 'primary') ?? columns[0],
    secondary: columns.filter((c) => c.onPhone === 'secondary'),
    trailing: columns.filter((c) => c.onPhone === 'trailing'),
  };

  return (
    <>
      {/* --- Wide: a real table ------------------------------------------------------------ */}
      <div className="datatable scroll-x">
        <table className="datatable__table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.id === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    data-numeric={column.numeric ? 'true' : undefined}
                    /* The sort state belongs on the header cell, not on the button inside it:
                       that is what a screen reader reads when it announces the column. */
                    aria-sort={
                      active ? (sort.desc ? 'descending' : 'ascending') : undefined
                    }
                    title={column.title}
                  >
                    {column.sort ? (
                      <button
                        type="button"
                        className="datatable__sort"
                        onClick={() => toggle(column.id)}
                      >
                        {column.label}
                        <span aria-hidden="true" className="datatable__arrow">
                          {active ? (sort.desc ? '▾' : '▴') : ''}
                        </span>
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const current = isCurrent?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  data-current={current ? 'true' : undefined}
                  aria-current={current ? 'true' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  data-clickable={onRowClick ? 'true' : undefined}
                >
                  {columns.map((column, index) => {
                    const content = column.render(row);
                    /*
                     * The first cell is a row header and, when the table is clickable, the cell
                     * that carries the button.
                     *
                     * A click handler on the `<tr>` alone is a mouse-only affordance — no tab
                     * stop, no Enter, invisible to a screen reader. Putting a real button in the
                     * row header gives keyboard and AT users the same row, once, rather than a
                     * button in every cell.
                     */
                    if (index === 0) {
                      return (
                        <th key={column.id} scope="row" data-numeric={column.numeric ? 'true' : undefined}>
                          {onRowClick ? (
                            <button
                              type="button"
                              className="datatable__rowbutton"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRowClick(row);
                              }}
                            >
                              {content}
                            </button>
                          ) : (
                            content
                          )}
                        </th>
                      );
                    }
                    return (
                      <td key={column.id} data-numeric={column.numeric ? 'true' : undefined}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* --- Phone: the same data, composed as rows ---------------------------------------- */}
      <div className="datatable__rows">
        {sorted.map((row) => {
          const current = isCurrent?.(row);
          const body = (
            <>
              <span className="datatable__row-body">
                <span className="datatable__row-primary">{phone.primary?.render(row)}</span>
                {phone.secondary.length > 0 && (
                  <span className="datatable__row-secondary">
                    {phone.secondary.map((column, i) => (
                      <span key={column.id}>
                        {i > 0 && <span aria-hidden="true"> · </span>}
                        {column.render(row)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {phone.trailing.length > 0 && (
                <span className="datatable__row-trailing">
                  {phone.trailing.map((column) => (
                    <span key={column.id}>{column.render(row)}</span>
                  ))}
                </span>
              )}
            </>
          );

          return onRowClick ? (
            <button
              key={rowKey(row)}
              type="button"
              className="datatable__row"
              data-current={current ? 'true' : undefined}
              aria-current={current ? 'true' : undefined}
              onClick={() => onRowClick(row)}
            >
              {body}
            </button>
          ) : (
            <div
              key={rowKey(row)}
              className="datatable__row"
              data-current={current ? 'true' : undefined}
            >
              {body}
            </div>
          );
        })}
      </div>
    </>
  );
}
