/**
 * Calculator Field Definitions
 * 
 * Single source of truth for field order, types, tooltips, and formatting.
 * This ensures consistency across all calculator views.
 * 
 * Order matches wireframe design with logical groupings and separators.
 */

import type { EducationLevel } from '../types/api';
import type { EditableInputs } from './educationCalculator';

export type FieldCategory = 'input' | 'computed';
export type FieldType = 'integer' | 'percentage' | 'readonly-integer';

export interface FieldDefinition {
  key: keyof EditableInputs | 'studentsPublic' | 'totalSeatsNeeded' | 'classroomsNeeded' | 'newClassroomsNeeded';
  label: string;
  tooltip: string;
  category: FieldCategory;
  type: FieldType;
  order: number;
  isPrimary?: boolean; // For highlighting primary result
  isReadOnly?: boolean;
  separatorAfter?: boolean; // Add horizontal separator after this field
}

/**
 * Field definitions in the correct logical order matching wireframe
 */
export const FIELD_DEFINITIONS: FieldDefinition[] = [
  // ========================================
  // SECTION 1: Basic Population Data
  // ========================================
  {
    key: 'pop',
    label: 'População Estimada',
    tooltip: 'Soma da população estimada por faixa etária no município.',
    category: 'input',
    type: 'integer',
    order: 1,
  },
  {
    key: 'pctOutOfSchool',
    label: 'Pct. fora da Escola',
    tooltip: '100 × [1 − (Matrículas Totais / População)]',
    category: 'input',
    type: 'percentage',
    order: 2,
  },
  {
    key: 'pctPrivate',
    label: 'Pct. em Escolas Privadas',
    tooltip: '100 × (Matrículas Privadas / População)',
    category: 'input',
    type: 'percentage',
    order: 3,
    separatorAfter: true,
  },

  // ========================================
  // SECTION 2: Public School Students & Time Distribution
  // ========================================
  {
    key: 'studentsPublic',
    label: 'Alunos em Escolas Públicas',
    tooltip: 'Número calculado de alunos em escolas públicas.',
    category: 'computed',
    type: 'readonly-integer',
    order: 4,
    isReadOnly: true,
  },
  {
    key: 'pctIntegral',
    label: 'Pct. em Tempo Integral',
    tooltip: 'Participação de alunos em tempo integral.',
    category: 'input',
    type: 'percentage',
    order: 5,
  },
  {
    key: 'pctNocturnal',
    label: 'Pct. em Período Noturno',
    tooltip: 'Aproximação baseada em matrículas noturnas ponderadas pela proporção do nível na unidade espacial.',
    category: 'input',
    type: 'percentage',
    order: 6,
    separatorAfter: true,
  },

  // ========================================
  // SECTION 3: Seats Calculation
  // ========================================
  {
    key: 'totalSeatsNeeded',
    label: 'Vagas Necessárias',
    tooltip: 'Total de vagas necessárias considerando tempo integral e período noturno.',
    category: 'computed',
    type: 'readonly-integer',
    order: 7,
    isReadOnly: true,
  },
  {
    key: 'seatsPerClass',
    label: 'Vagas por Sala',
    tooltip: 'Constantes padrão por nível; ajuste para cenários.',
    category: 'input',
    type: 'integer',
    order: 8,
    separatorAfter: true,
  },

  // ========================================
  // SECTION 4: Classrooms Calculation
  // ========================================
  {
    key: 'classroomsNeeded',
    label: 'Salas Necessárias',
    tooltip: 'Número total de salas necessárias (vagas necessárias / vagas por sala).',
    category: 'computed',
    type: 'readonly-integer',
    order: 9,
    isReadOnly: true,
  },
  {
    key: 'existingClassrooms',
    label: 'Salas Existentes',
    tooltip: 'Arredondamento para cima da soma de salas utilizadas multiplicada pela proporção do nível.',
    category: 'input',
    type: 'integer',
    order: 10,
    separatorAfter: true,
  },

  // ========================================
  // SECTION 5: PRIMARY RESULT
  // ========================================
  {
    key: 'newClassroomsNeeded',
    label: 'Novas Salas Necessárias',
    tooltip: 'Salas adicionais necessárias (salas necessárias - salas existentes).',
    category: 'computed',
    type: 'readonly-integer',
    order: 11,
    isReadOnly: true,
    isPrimary: true,
  },
];

/**
 * Get all fields in order (for unified view without input/computed split)
 */
export function getAllFieldsInOrder(): FieldDefinition[] {
  return FIELD_DEFINITIONS.sort((a, b) => a.order - b.order);
}

/**
 * Get fields by category for grouped rendering
 */
export function getFieldsByCategory(category: FieldCategory): FieldDefinition[] {
  return FIELD_DEFINITIONS.filter(f => f.category === category).sort((a, b) => a.order - b.order);
}

/**
 * Get input fields (editable)
 */
export function getInputFields(): FieldDefinition[] {
  return getFieldsByCategory('input');
}

/**
 * Get computed fields (read-only)
 */
export function getComputedFields(): FieldDefinition[] {
  return getFieldsByCategory('computed');
}

/**
 * Get primary result field
 */
export function getPrimaryResultField(): FieldDefinition {
  return FIELD_DEFINITIONS.find(f => f.isPrimary) || FIELD_DEFINITIONS[FIELD_DEFINITIONS.length - 1];
}

/**
 * Get field definition by key
 */
export function getFieldDefinition(key: string): FieldDefinition | undefined {
  return FIELD_DEFINITIONS.find(f => f.key === key);
}

/**
 * Education level labels (shared across components)
 */
export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  INF_CRE: 'Creche',
  INF_PRE: 'Pré-Escola',
  FUND_AI: 'Fund. Anos Iniciais',
  FUND_AF: 'Fund. Anos Finais',
  MED: 'Ensino Médio',
};

/**
 * Get short label for mobile/compact views
 */
export const EDUCATION_LEVEL_LABELS_SHORT: Record<EducationLevel, string> = {
  INF_CRE: 'Creche',
  INF_PRE: 'Pré-escola',
  FUND_AI: 'Anos Iniciais',
  FUND_AF: 'Anos Finais',
  MED: 'Médio',
};
