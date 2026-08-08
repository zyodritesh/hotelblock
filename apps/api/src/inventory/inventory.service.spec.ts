function sellable(day: {
  baseCapacity: number;
  confirmedRoomNights: number;
  activeGroupBlocks: number;
  activeHolds: number;
  outOfOrderOrService: number;
  authorisedOverbooking: number;
}) {
  return (
    day.baseCapacity -
    day.confirmedRoomNights -
    day.activeGroupBlocks -
    day.activeHolds -
    day.outOfOrderOrService +
    day.authorisedOverbooking
  );
}

describe('inventory sellable invariant', () => {
  it('matches PRD formula', () => {
    expect(
      sellable({
        baseCapacity: 10,
        confirmedRoomNights: 4,
        activeGroupBlocks: 2,
        activeHolds: 1,
        outOfOrderOrService: 1,
        authorisedOverbooking: 1,
      }),
    ).toBe(3);
  });

  it('rejects oversell when sellable is zero', () => {
    const available = sellable({
      baseCapacity: 2,
      confirmedRoomNights: 2,
      activeGroupBlocks: 0,
      activeHolds: 0,
      outOfOrderOrService: 0,
      authorisedOverbooking: 0,
    });
    expect(available < 1).toBe(true);
  });
});
