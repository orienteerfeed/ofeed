class ValidationError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export default ValidationError;
