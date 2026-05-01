import { gql } from 'graphql-tag';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Derive __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userSchema = fs.readFileSync(path.join(__dirname, 'user.graphql'), 'utf8');
const propertySchema = fs.readFileSync(path.join(__dirname, 'property.graphql'), 'utf8');
const bookingSchema = fs.readFileSync(path.join(__dirname, 'booking.graphql'), 'utf8');
const messageSchema = fs.readFileSync(path.join(__dirname, 'message.graphql'), 'utf8');
const reviewSchema = fs.readFileSync(path.join(__dirname, 'review.graphql'), 'utf8');
// const experienceSchema = fs.readFileSync(path.join(__dirname, 'experience.graphql'), 'utf8');
const authSchema = fs.readFileSync(path.join(__dirname, 'auth.graphql'), 'utf8');
const paymentSchema = fs.readFileSync(path.join(__dirname, 'payment.graphql'), 'utf8');
const roomTypeSchema = fs.readFileSync(path.join(__dirname, 'room_type.graphql'), 'utf8');
const exe = fs.readFileSync(path.join(__dirname, 'exe.graphql'), 'utf8');
const agent = fs.readFileSync(path.join(__dirname, 'agent.graphql'), 'utf8');

export const typeDefs = gql`
  ${userSchema}
  ${propertySchema}
  ${roomTypeSchema}
  ${bookingSchema}
  ${messageSchema}
  ${reviewSchema}
  ${authSchema}
  ${paymentSchema}
  ${exe}
  ${agent}
`;