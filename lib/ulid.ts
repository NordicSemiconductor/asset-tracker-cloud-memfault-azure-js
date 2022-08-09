import id128 from 'id128'

export const ulid = (): string => id128.Ulid.generate().toCanonical()
