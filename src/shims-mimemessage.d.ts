declare module 'mimemessage' {
  export interface Entity {
    header: (name: string) => string,
    body: string,
  }

  export function parse(rawMessage: string): Entity
}
