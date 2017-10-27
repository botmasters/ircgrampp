
import Table from 'cli-table';

export default function(head, content = []) {
    let table = new Table({
        head,
        chars: {
            'top': '', 'top-mid': '', 'top-left': '', 'top-right': '',
            'bottom': '', 'bottom-mid': '', 'bottom-left': '',
            'bottom-right': '', 'left': '', 'left-mid': '', 'mid': '',
            'mid-mid': '', 'right': '', 'right-mid': '' ,'middle': '  '
        },
        style: { 'padding-left': 0, 'padding-right': 0 }
    });

    content.forEach((r) => table.push(r));
    return table; 
}
