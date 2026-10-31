-- Bank receipts stored the booking day as a midnight timestamp, a time the bank
-- never reported. Use the server match time instead; the booking day stays on
-- BankTransaction.bookingDate.
UPDATE `EntryPayment` SET `paidAt` = `recordedAt` WHERE `source` = 'BANK_IMPORT';
