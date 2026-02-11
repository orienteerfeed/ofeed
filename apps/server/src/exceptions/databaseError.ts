class DatabaseError extends Error {
  statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 500;
  }
}

export default DatabaseError;
