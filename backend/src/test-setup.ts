// Feste Testwerte für Jest – niemals produktiv verwenden.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123';
process.env.DATABASE_ENCRYPTION_KEY ??= 'a'.repeat(64);
