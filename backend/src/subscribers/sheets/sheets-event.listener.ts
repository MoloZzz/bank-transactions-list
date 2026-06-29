import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TRANSACTION_CREATED } from '../../events/events';
import { NormalizedTransaction } from '../../core/normalize/normalized-transaction';
import { SheetsSubscriber } from './sheets.subscriber';

/**
 * Thin Nest binding: routes TRANSACTION_CREATED to the framework-free
 * SheetsSubscriber. Keeping the decorator here (not on the subscriber) lets the
 * subscriber stay a plain, trivially testable class.
 */
@Injectable()
export class SheetsEventListener {
  constructor(private readonly subscriber: SheetsSubscriber) {}

  @OnEvent(TRANSACTION_CREATED)
  handle(tx: NormalizedTransaction): void {
    this.subscriber.onTransactionCreated(tx);
  }
}
