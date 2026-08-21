/**
 * The layout and density primitives.
 *
 * Tested directly rather than only through the screens that use them, because every one of them
 * carries a rule that is invisible in a screenshot and easy to lose in a refactor: a table that
 * is only clickable with a mouse, a master/detail that leaves a screen reader on a row that is
 * no longer rendered, a phone rendering announced twice because both compositions are in the
 * accessibility tree at once.
 *
 * jsdom has no layout, so the *width* half of these components cannot be asserted here — CSS
 * decides which composition shows and jsdom applies none. What is asserted is everything that is
 * not CSS: the semantics, the keyboard targets, the sort, and the DOM the two compositions
 * produce. `matchMedia` is stubbed where a component reads it, since jsdom does not implement it.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, MasterDetail, type Column } from '../../packages/app/src/ui';

afterEach(cleanup);

interface Row {
  id: string;
  name: string;
  rank: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Henderson', rank: 4 },
  { id: 'b', name: 'Sokolov', rank: 1 },
  { id: 'c', name: 'Vance', rank: 9 },
];

const COLUMNS: Column<Row>[] = [
  { id: 'name', label: 'Fighter', render: (r) => r.name, onPhone: 'primary' },
  {
    id: 'rank',
    label: 'Rank',
    render: (r) => `#${r.rank}`,
    sort: (a, b) => a.rank - b.rank,
    numeric: true,
    onPhone: 'secondary',
  },
];

describe('DataTable', () => {
  it('renders a real table, with headers tied to their cells', () => {
    render(<DataTable rows={ROWS} columns={COLUMNS} rowKey={(r) => r.id} caption="Rankings" />);

    // `<table>` semantics are the entire reason this is not a grid of divs: a screen reader
    // navigating by column hears the header repeated with each cell, and a div grid cannot.
    const table = screen.getByRole('table', { name: 'Rankings' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    // The first column is a row header, so each row announces its own subject.
    expect(within(table).getAllByRole('rowheader')).toHaveLength(3);
  });

  it('gives a clickable row a keyboard target rather than only a mouse one', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        caption="Rankings"
        onRowClick={onRowClick}
      />,
    );

    // A handler on the <tr> alone is invisible to a keyboard and to assistive tech. The row
    // header carries a real button, once per row rather than once per cell.
    const buttons = screen.getAllByRole('button', { name: 'Henderson' });
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0]!);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  it('sorts on a sortable column and says so on the header', async () => {
    const user = userEvent.setup();
    render(
      <DataTable rows={ROWS} columns={COLUMNS} rowKey={(r) => r.id} caption="Rankings" />,
    );

    const header = screen.getByRole('columnheader', { name: /Rank/ });
    // Unsorted until asked: rows render in the order the caller gave them.
    expect(header.getAttribute('aria-sort')).toBeNull();

    await user.click(within(header).getByRole('button'));
    expect(header.getAttribute('aria-sort')).toBe('descending');
    await user.click(within(header).getByRole('button'));
    expect(header.getAttribute('aria-sort')).toBe('ascending');

    // Ascending by rank puts #1 first. Read off the table specifically — the phone rendering
    // is in the DOM too, and asserting across both would pass for the wrong reason.
    const table = screen.getByRole('table');
    const first = within(table).getAllByRole('rowheader')[0];
    expect(first?.textContent).toBe('Sokolov');
  });

  it('marks the reader’s own row for assistive tech, not only in colour', () => {
    render(
      <DataTable
        rows={ROWS}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        caption="Rankings"
        isCurrent={(r) => r.id === 'b'}
      />,
    );

    const table = screen.getByRole('table');
    const current = within(table)
      .getAllByRole('row')
      .filter((row) => row.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain('Sokolov');
  });

  it('shows the empty state instead of a table with no rows in it', () => {
    render(
      <DataTable
        rows={[]}
        columns={COLUMNS}
        rowKey={(r) => r.id}
        caption="Rankings"
        empty={<p>Nobody ranked here yet</p>}
      />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/Nobody ranked here yet/)).toBeTruthy();
  });
});

describe('MasterDetail', () => {
  /** jsdom implements no `matchMedia`, and the component reads it to decide about focus. */
  const stubWidth = (wide: boolean) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({ matches: wide, addEventListener() {}, removeEventListener() {} }),
    );
  };

  afterEach(() => vi.unstubAllGlobals());

  it('shows the placeholder rather than an empty panel when nothing is selected', () => {
    stubWidth(true);
    render(
      <MasterDetail
        list={<p>Two candidates</p>}
        detail={<p>Henderson</p>}
        selected={false}
        onClear={() => {}}
        listLabel="Candidates"
        detailLabel="Preview"
        placeholder={<p>Pick somebody to look at</p>}
      />,
    );

    expect(screen.getByText(/Pick somebody to look at/)).toBeTruthy();
    expect(screen.queryByText('Henderson')).toBeNull();
  });

  it('offers a way back to the list only once something is selected', async () => {
    const user = userEvent.setup();
    stubWidth(false);
    const onClear = vi.fn();
    render(
      <MasterDetail
        list={<p>Two candidates</p>}
        detail={<p>Henderson</p>}
        selected
        onClear={onClear}
        listLabel="Candidates"
        detailLabel="Preview"
      />,
    );

    // Rendered on the phone composition and hidden by CSS on the wide one, where the list
    // never leaves and a control pointing back at it would point at itself.
    await user.click(screen.getByRole('button', { name: /Candidates/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it('moves focus to the detail region on a phone, where selection replaces the viewport', () => {
    stubWidth(false);
    const { rerender } = render(
      <MasterDetail
        list={<p>Two candidates</p>}
        detail={<p>Henderson</p>}
        selected={false}
        onClear={() => {}}
        listLabel="Candidates"
        detailLabel="Preview"
      />,
    );

    rerender(
      <MasterDetail
        list={<p>Two candidates</p>}
        detail={<p>Henderson</p>}
        selected
        onClear={() => {}}
        listLabel="Candidates"
        detailLabel="Preview"
      />,
    );

    // Without this a screen-reader cursor stays on a row that is no longer rendered and the
    // user is told nothing happened — the shell fixes this on navigation, and selection here
    // is state rather than a route, so it has to be fixed again.
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Preview' }));
  });

  it('does not steal focus on a wide screen, where the list stays put', () => {
    stubWidth(true);
    const { rerender } = render(
      <MasterDetail
        list={<p>Two candidates</p>}
        detail={<p>Henderson</p>}
        selected={false}
        onClear={() => {}}
        listLabel="Candidates"
        detailLabel="Preview"
      />,
    );
    rerender(
      <MasterDetail
        list={<p>Two candidates</p>}
        detail={<p>Henderson</p>}
        selected
        onClear={() => {}}
        listLabel="Candidates"
        detailLabel="Preview"
      />,
    );

    expect(document.activeElement).not.toBe(screen.getByRole('group', { name: 'Preview' }));
  });
});
