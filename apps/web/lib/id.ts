import { nanoid } from "nanoid";

export function newId() {
  return nanoid(16);
}

export function newCardId() {
  return `CARD_${Date.now()}`;
}
