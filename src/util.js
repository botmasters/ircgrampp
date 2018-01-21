
export function escapeMarkdown(str) {
    return str
        .replace(/([`\*_\[])/g, `\\$1`) 
    ;
}
