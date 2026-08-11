import type { EducationLevel } from './api';
import type { EditableInputs, TableOutput } from '@/lib/educationCalculator';

export interface ReportData {
  // Region info
  stateName: string;
  stateCode: string;
  municipalityName: string | null;
  
  // Filter selections
  selectedEducationLevels: EducationLevel[];
  hexagonResolution: number;
  filterRange: [number, number];
  
  // Calculator data
  calculatorInputs: EditableInputs | null;
  calculatorResults: TableOutput | null;
  
  // Hexagon data for breakdown
  hexagonSummary: HexagonReportRow[];
  
  // Metadata
  generatedAt: Date;
}

export interface HexagonReportRow {
  hexId: string;
  rank: number;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  totalNewClassrooms: number;
  byLevel: Record<EducationLevel, number>;
}

export const HEXAGON_RESOLUTION_INFO: Record<number, { area: string; analogy: string; description: string }> = {
  5: {
    area: '252.9 km²',
    analogy: 'Área de uma cidade pequena',
    description: 'Adequado para análises em nível estadual ou regional ampla.'
  },
  6: {
    area: '36.13 km²',
    analogy: 'Área de um bairro grande',
    description: 'Adequado para análises em nível de bairro ou áreas urbanas médias.'
  },
  7: {
    area: '5.16 km²',
    analogy: 'Área de uma zona de bairro',
    description: 'Adequado para análises em nível de zona de bairro ou áreas urbanas.'
  },
  8: {
    area: '0.74 km²',
    analogy: 'Área de uma vizinhança',
    description: 'Adequado para análises detalhadas em nível de vizinhança.'
  }
};
