import { describe, it, expect } from 'vitest';
import {
    computeExtrasPerHex,
    displayClassroomsNeeded,
    displayClassroomsSurplus,
    displaySignedClassroomBalance,
    summarizeClassroomBalance,
    PerHexRow,
    TableParams,
} from './hexExtras';

describe('Extended Aggregation Verification', () => {
    const level = 'INF_CRE';

    // Helper to create a base params object
    const createParams = (students: number, existing: number, seatsPerClass: number = 20): TableParams => ({
        studentsPublic: { [level]: students } as any,
        existingClassrooms: { [level]: existing } as any,
        pctIntegral: { [level]: 0 } as any,
        pctNocturnal: { [level]: 0 } as any,
        seatsPerClass: { [level]: seatsPerClass } as any,
    });

    // Helper to create a hex row
    const createHex = (id: string, studentsProp: number, rawExisting: number): PerHexRow => ({
        hexId: id,
        QT_SALAS_UTILIZADAS: rawExisting,
        QT_MAT: { [level]: 100 * studentsProp } as any,
        QT_MAT_PROP: { [level]: 1 } as any,
    });

    it('Scenario 1: Massive Spillover (The Original Bug)', () => {
        // Calculator: Need 3 classrooms (60 students / 20 seats), Have 0 existing. Net Extra = 3.
        const params = createParams(60, 0, 20);

        // Map: Single large hex.
        // IT has raw data showing 10 existing classrooms (schools from outside municipality).
        const hexes = [createHex('hex1', 1.0, 10)];

        const results = computeExtrasPerHex(hexes, params, [level]);
        const hex = results[0];

        // Verification 1: Logic Check
        // Raw Existing was 10. Municipal Existing is 0.
        // Normalized Existing should be 0 * (10/10) = 0.
        // Need = 60 / 20 = 3.
        // Extra = Need (3) - Normalized Existing (0) = 3.
        const netExtra = (hex.perLevel as any)[level];
        expect(netExtra).toBe(3);

        // Verification 2: Display
        // With our ceil fix, 3 -> 3.
        expect(Math.ceil(hex.totalExtra)).toBe(3);
    });

    it('Scenario 2: Under-coverage (Data Missing in Map)', () => {
        // Calculator: Need 5 (100/20). Have 10 existing. Net = -5 (Surplus).
        // Map: Hexes only show 8 raw existing classrooms in total.
        const params = createParams(100, 10, 20);
        const hexes = [
            createHex('hex1', 0.5, 4),
            createHex('hex2', 0.5, 4)
        ];

        const results = computeExtrasPerHex(hexes, params, [level]);

        // Total Net Extra across all hexes should match Calculator Net (-5).
        const totalNetExtra = results.reduce((acc, r) => acc + (r.perLevel as any)[level], 0);
        expect(totalNetExtra).toBeCloseTo(-5);

        // Per Hex Logic:
        // Need: 50 students / 20 = 2.5 per hex.
        // Normalized Existing: 10 * (4/8) = 5 per hex.
        // Extra: 2.5 - 5 = -2.5.
        expect((results[0].perLevel as any)[level]).toBeCloseTo(-2.5);
        expect((results[1].perLevel as any)[level]).toBeCloseTo(-2.5);
    });

    it('Scenario 3: Uneven Distribution (Verify Weights)', () => {
        // Calculator: Need 5 (100/20). Existing 10. Net -5.
        const params = createParams(100, 10, 20);
        const hexes = [
            createHex('hex1', 0.5, 1),  // 10% of raw existing
            createHex('hex2', 0.5, 9)   // 90% of raw existing
        ];

        const results = computeExtrasPerHex(hexes, params, [level]);

        // Hex 1:
        // Need: 2.5.
        // Normalized Existing: 10 * (1/10) = 1.
        // Extra: 2.5 - 1 = 1.5.
        expect((results[0].perLevel as any)[level]).toBeCloseTo(1.5);

        // Hex 2:
        // Need: 2.5.
        // Normalized Existing: 10 * (9/10) = 9.
        // Extra: 2.5 - 9 = -6.5.
        expect((results[1].perLevel as any)[level]).toBeCloseTo(-6.5);
    });

    it('Scenario 4: High Fragmentation (Conservative Map Sum property)', () => {
        // Calculator: Need 3.1 classrooms. Existing 0. Net = 4 (Ceil(3.1)).
        // But logically Net Fractional = 3.1.
        const params = createParams(62, 0, 20); // Need 3.1

        // Map: 10 hexes, equal distribution.
        // Each Need = 0.31. Fixed Existing = 0. Extra = 0.31.
        // Displayed = Ceil(0.31) = 1.
        // Sum Displayed = 10.
        const hexes = Array.from({ length: 10 }, (_, i) => createHex(`hex${i}`, 0.1, 0));

        const results = computeExtrasPerHex(hexes, params, [level]);

        const sumMapDisplayed = results.reduce((acc, r) => acc + Math.ceil(r.totalExtra), 0);
        expect(sumMapDisplayed).toBe(10);
        // Confirm it is conservative (>= 4).
        expect(sumMapDisplayed).toBeGreaterThanOrEqual(4);
    });

    it('Scenario 5: Zero Raw Existing (Fallback)', () => {
        // Calculator: Need 5. Existing 5. Net = 0.
        // Map: Raw Existing = 0.
        // Fallback logic -> Existing becomes 0 for everyone because we can't distribute.
        // So Map will show Need 5 - Existing 0 = 5.
        // Conservative behavior: If we don't know where schools are, we assume worst case (no schools) on the map layer?
        // Or at least we don't crash.
        const params = createParams(100, 5, 20);
        const hexes = [createHex('hex1', 1.0, 0)];

        const results = computeExtrasPerHex(hexes, params, [level]);

        // Need 5. Existing 0. Extra = 5.
        const netExtra = (results[0].perLevel as any)[level];
        expect(netExtra).toBe(5);
    });

    it('Scenario 6: Precomputed rollups preserve weighted classroom distribution', () => {
        const params = createParams(1000, 20, 10);

        const sourceRows: PerHexRow[] = [
            { hexId: 'a1', QT_SALAS_UTILIZADAS: 10, QT_MAT: { [level]: 100 } as any, QT_MAT_PROP: { [level]: 0.2 } as any },
            { hexId: 'a2', QT_SALAS_UTILIZADAS: 20, QT_MAT: { [level]: 300 } as any, QT_MAT_PROP: { [level]: 0.5 } as any },
            { hexId: 'b1', QT_SALAS_UTILIZADAS: 10, QT_MAT: { [level]: 100 } as any, QT_MAT_PROP: { [level]: 0.4 } as any },
            { hexId: 'b2', QT_SALAS_UTILIZADAS: 10, QT_MAT: { [level]: 500 } as any, QT_MAT_PROP: { [level]: 0.4 } as any },
        ];

        const source = computeExtrasPerHex(sourceRows, params, [level]);
        const sourceA = source[0].perLevel[level] + source[1].perLevel[level];
        const sourceB = source[2].perLevel[level] + source[3].perLevel[level];

        const weightedRollups: PerHexRow[] = [
            {
                hexId: 'a',
                QT_SALAS_UTILIZADAS: 30,
                QT_MAT: { [level]: 400 } as any,
                QT_MAT_PROP: { [level]: 0 } as any,
                QT_SALAS_WEIGHTED: { [level]: 12 } as any,
            },
            {
                hexId: 'b',
                QT_SALAS_UTILIZADAS: 20,
                QT_MAT: { [level]: 600 } as any,
                QT_MAT_PROP: { [level]: 0 } as any,
                QT_SALAS_WEIGHTED: { [level]: 8 } as any,
            },
        ];

        const rollup = computeExtrasPerHex(weightedRollups, params, [level]);

        expect(rollup[0].perLevel[level]).toBeCloseTo(sourceA);
        expect(rollup[1].perLevel[level]).toBeCloseTo(sourceB);

        const legacyRollups: PerHexRow[] = [
            {
                hexId: 'a',
                QT_SALAS_UTILIZADAS: 30,
                QT_MAT: { [level]: 400 } as any,
                QT_MAT_PROP: { [level]: 0.7 } as any,
            },
            {
                hexId: 'b',
                QT_SALAS_UTILIZADAS: 20,
                QT_MAT: { [level]: 600 } as any,
                QT_MAT_PROP: { [level]: 0.4 } as any,
            },
        ];

        const legacy = computeExtrasPerHex(legacyRollups, params, [level]);
        expect(legacy[0].perLevel[level]).not.toBeCloseTo(sourceA);
        expect(legacy[1].perLevel[level]).not.toBeCloseTo(sourceB);
    });
});

describe('Signed classroom balance display invariants', () => {
    it('rounds surplus down because fractional spare capacity is not a full classroom', () => {
        expect(displayClassroomsSurplus(-0.3)).toBe(0);
        expect(displayClassroomsSurplus(-1.2)).toBe(1);
        expect(displayClassroomsSurplus(-5.2)).toBe(5);
        expect(displayClassroomsSurplus(0)).toBe(0);
        expect(displayClassroomsSurplus(0.3)).toBe(0);
    });

    it('rounds missing classrooms up and ignores non-demand values', () => {
        expect(displayClassroomsNeeded(-10.4)).toBe(0);
        expect(displayClassroomsNeeded(0)).toBe(0);
        expect(displayClassroomsNeeded(0.01)).toBe(1);
        expect(displayClassroomsNeeded(1.01)).toBe(2);
    });

    it('uses the approved signed balance contract for missing and surplus classrooms', () => {
        expect(displaySignedClassroomBalance(4.7)).toBe(-5);
        expect(displaySignedClassroomBalance(-5.2)).toBe(5);
        expect(displaySignedClassroomBalance(-0.9)).toBe(0);

        const summary = summarizeClassroomBalance({
            INF_CRE: 4.7,
            INF_PRE: 0,
            FUND_AI: 0,
            FUND_AF: 0,
            MED: -5.2,
        }, ['INF_CRE', 'MED']);

        expect(summary.perLevelBalance.INF_CRE).toBe(-5);
        expect(summary.perLevelBalance.MED).toBe(5);
        expect(summary.netBalance).toBe(0);
        expect(summary.classroomsNeeded).toBe(0);
        expect(summary.classroomsSurplus).toBe(0);
    });

    it('keeps the Bauru sign transition smooth after per-level rounding', () => {
        const at41 = summarizeClassroomBalance({
            INF_CRE: 5.732351969560291,
            FUND_AI: -5.798127676570314,
        }, ['INF_CRE', 'FUND_AI']);
        const at39 = summarizeClassroomBalance({
            INF_CRE: 6.404889963955158,
            FUND_AI: -5.798127676570314,
        }, ['INF_CRE', 'FUND_AI']);

        expect(at41.netBalance).toBe(-1);
        expect(at41.classroomsNeeded).toBe(1);
        expect(at39.netBalance).toBe(-2);
        expect(at39.classroomsNeeded).toBe(2);
    });
});
