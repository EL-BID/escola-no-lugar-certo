import { describe, it, expect } from 'vitest';
import { computeTable, LEVELS, type EditableInputs } from './educationCalculator';

const zeroInputs: EditableInputs = {
  pop: { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
  pctOutOfSchool: { INF_CRE: 10, INF_PRE: 10, FUND_AI: 10, FUND_AF: 10, MED: 10 },
  pctPrivate: { INF_CRE: 5, INF_PRE: 5, FUND_AI: 5, FUND_AF: 5, MED: 5 },
  pctIntegral: { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
  pctNocturnal: { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
  seatsPerClass: { INF_CRE: 15, INF_PRE: 25, FUND_AI: 35, FUND_AF: 40, MED: 40 },
  existingClassrooms: { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
};

describe('educationCalculator.computeTable', () => {
  it('handles zero population safely', () => {
    const out = computeTable(zeroInputs);
    expect(out.totals.newClassroomsNeeded).toBe(0);
    for (const l of LEVELS) {
      expect(out.byLevel[l].classroomsNeeded).toBe(0);
    }
  });

  it('basic positive flow with ceiling and existing classrooms', () => {
    const inputs: EditableInputs = {
      pop: { INF_CRE: 1000, INF_PRE: 1000, FUND_AI: 1000, FUND_AF: 1000, MED: 1000 },
      pctOutOfSchool: { INF_CRE: 10, INF_PRE: 10, FUND_AI: 10, FUND_AF: 10, MED: 10 },
      pctPrivate: { INF_CRE: 5, INF_PRE: 5, FUND_AI: 5, FUND_AF: 5, MED: 5 },
      pctIntegral: { INF_CRE: 0, INF_PRE: 10, FUND_AI: 20, FUND_AF: 0, MED: 0 },
      pctNocturnal: { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 10, MED: 10 },
      seatsPerClass: { INF_CRE: 15, INF_PRE: 25, FUND_AI: 35, FUND_AF: 40, MED: 40 },
      existingClassrooms: { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 1, MED: 0 },
    };

    const out = computeTable(inputs);

    // INF_PRE sanity: public students = 1000 * (1 - 0.10 - 0.05) = 850
    // integral 10% => seats = 850 * 1.1 = 935
    // seats/class 25 => classrooms = ceil(935/25) = 38
    expect(out.byLevel.INF_PRE.classroomsNeeded).toBe(38);

    // FUND_AF sanity: nocturnal 10% reduces seats by 10%
    // public = 850, integral 0 => seats = 850 * (1 - 0.10) = 765
    // rooms = ceil(765 / 40) = 20, existing 1 => new = ceil(max(20-1,0)) = 19
    expect(out.byLevel.FUND_AF.classroomsNeeded).toBe(20);
    expect(out.byLevel.FUND_AF.newClassroomsNeeded).toBe(19);
  });

  it('clamps percentage inputs implicitly via pctTo01 in computeTable', () => {
    const inputs: EditableInputs = {
      pop: { INF_CRE: 100, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
      pctOutOfSchool: { INF_CRE: -50, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
      pctPrivate: { INF_CRE: 200, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
      pctIntegral: { INF_CRE: 1000, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
      pctNocturnal: { INF_CRE: -10, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
      seatsPerClass: { INF_CRE: 10, INF_PRE: 1, FUND_AI: 1, FUND_AF: 1, MED: 1 },
      existingClassrooms: { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 0, MED: 0 },
    };

    const out = computeTable(inputs);
    // pctOutOfSchool -50% -> 0, pctPrivate 200% -> 100%
    // studentsPublic = 100 * (1 - 0 - 1) = 0
    expect(out.byLevel.INF_CRE.studentsPublic).toBe(0);
    expect(out.byLevel.INF_CRE.classroomsNeeded).toBe(0);
  });

  it('reproduces sample from original Dash table (rounded display)', () => {
    // Values from the screenshot/table for one municipality (columns ordered by levels)
    const pop = { INF_CRE: 70264, INF_PRE: 38084, FUND_AI: 102890, FUND_AF: 89353, MED: 71235 } as const;
    const pctPrivate = { INF_CRE: 5, INF_PRE: 16, FUND_AI: 15, FUND_AF: 15, MED: 13 } as const;
    const studentsPublic = { INF_CRE: 3617, INF_PRE: 10466, FUND_AI: 49779, FUND_AF: 46184, MED: 38638 } as const;
    const pctNocturnal = { INF_CRE: 0, INF_PRE: 0, FUND_AI: 0, FUND_AF: 10, MED: 11 } as const;
    const seatsPerClass = { INF_CRE: 15, INF_PRE: 25, FUND_AI: 35, FUND_AF: 40, MED: 40 } as const;
    const existingClassrooms = { INF_CRE: 204, INF_PRE: 459, FUND_AI: 1706, FUND_AF: 1579, MED: 1266 } as const;
    const seatsNeededExpected = { INF_CRE: 5833, INF_PRE: 11909, FUND_AI: 50969, FUND_AF: 42530, MED: 36604 } as const;
    const classroomsNeededExpected = { INF_CRE: 389, INF_PRE: 477, FUND_AI: 1457, FUND_AF: 1064, MED: 916 } as const;
    const newClassroomsExpected = { INF_CRE: 185, INF_PRE: 18, FUND_AI: 0, FUND_AF: 0, MED: 0 } as const;

    // Derive pctOutOfSchool from studentsPublic to align with the original calculation
    const pctOutOfSchool = {
      INF_CRE: 100 * (1 - studentsPublic.INF_CRE / pop.INF_CRE - pctPrivate.INF_CRE / 100),
      INF_PRE: 100 * (1 - studentsPublic.INF_PRE / pop.INF_PRE - pctPrivate.INF_PRE / 100),
      FUND_AI: 100 * (1 - studentsPublic.FUND_AI / pop.FUND_AI - pctPrivate.FUND_AI / 100),
      FUND_AF: 100 * (1 - studentsPublic.FUND_AF / pop.FUND_AF - pctPrivate.FUND_AF / 100),
      MED: 100 * (1 - studentsPublic.MED / pop.MED - pctPrivate.MED / 100),
    } as const;

    // Derive pctIntegral from seatsNeeded, studentsPublic and nocturnal share
    const pctIntegral = {
      INF_CRE: 100 * (seatsNeededExpected.INF_CRE / (studentsPublic.INF_CRE * (1 - pctNocturnal.INF_CRE / 100)) - 1),
      INF_PRE: 100 * (seatsNeededExpected.INF_PRE / (studentsPublic.INF_PRE * (1 - pctNocturnal.INF_PRE / 100)) - 1),
      FUND_AI: 100 * (seatsNeededExpected.FUND_AI / (studentsPublic.FUND_AI * (1 - pctNocturnal.FUND_AI / 100)) - 1),
      FUND_AF: 100 * (seatsNeededExpected.FUND_AF / (studentsPublic.FUND_AF * (1 - pctNocturnal.FUND_AF / 100)) - 1),
      MED: 100 * (seatsNeededExpected.MED / (studentsPublic.MED * (1 - pctNocturnal.MED / 100)) - 1),
    } as const;

    const inputs: EditableInputs = {
      pop: { ...pop },
      pctOutOfSchool: { ...pctOutOfSchool },
      pctPrivate: { ...pctPrivate },
      pctIntegral: { ...pctIntegral },
      pctNocturnal: { ...pctNocturnal },
      seatsPerClass: { ...seatsPerClass },
      existingClassrooms: { ...existingClassrooms },
    };

    const out = computeTable(inputs);

    // Seats and classrooms should match exactly when using the derived shares
    expect(Math.round(out.byLevel.INF_CRE.totalSeatsNeeded)).toBe(seatsNeededExpected.INF_CRE);
    expect(Math.round(out.byLevel.INF_PRE.totalSeatsNeeded)).toBe(seatsNeededExpected.INF_PRE);
    expect(Math.round(out.byLevel.FUND_AI.totalSeatsNeeded)).toBe(seatsNeededExpected.FUND_AI);
    expect(Math.round(out.byLevel.FUND_AF.totalSeatsNeeded)).toBe(seatsNeededExpected.FUND_AF);
    expect(Math.round(out.byLevel.MED.totalSeatsNeeded)).toBe(seatsNeededExpected.MED);

    expect(out.byLevel.INF_CRE.classroomsNeeded).toBe(classroomsNeededExpected.INF_CRE);
    expect(out.byLevel.INF_PRE.classroomsNeeded).toBe(classroomsNeededExpected.INF_PRE);
    expect(out.byLevel.FUND_AI.classroomsNeeded).toBe(classroomsNeededExpected.FUND_AI);
    expect(out.byLevel.FUND_AF.classroomsNeeded).toBe(classroomsNeededExpected.FUND_AF);
    expect(out.byLevel.MED.classroomsNeeded).toBe(classroomsNeededExpected.MED);

    expect(out.byLevel.INF_CRE.newClassroomsNeeded).toBe(newClassroomsExpected.INF_CRE);
    expect(out.byLevel.INF_PRE.newClassroomsNeeded).toBe(newClassroomsExpected.INF_PRE);
    expect(out.byLevel.FUND_AI.newClassroomsNeeded).toBe(newClassroomsExpected.FUND_AI);
    expect(out.byLevel.FUND_AF.newClassroomsNeeded).toBe(newClassroomsExpected.FUND_AF);
    expect(out.byLevel.MED.newClassroomsNeeded).toBe(newClassroomsExpected.MED);
  });
});
