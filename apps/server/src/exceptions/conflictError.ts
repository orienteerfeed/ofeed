class ConflictError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

export default ConflictError;
