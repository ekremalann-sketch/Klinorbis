// Servis hataları: kullanıcıya gösterilecek Türkçe mesaj + HTTP durumu. Kişisel veya klinik veri içermez.
export class ServiceError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export const notFound = (what: string) => new ServiceError(404, "NOT_FOUND", `${what} bulunamadı.`);
export const conflict = (message: string) => new ServiceError(409, "CONFLICT", message);
export const forbidden = (message = "Bu işlem için yetkiniz yok.") => new ServiceError(403, "FORBIDDEN", message);
export const invalid = (message: string) => new ServiceError(400, "INVALID_INPUT", message);
