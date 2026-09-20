export function calculateBmi(weightKg: number, heightCm: number): {
  bmi: number;
  category: "Underweight" | "Normal" | "Overweight" | "Obese";
} {
  if (!weightKg || weightKg <= 0 || !heightCm || heightCm <= 0) {
    return { bmi: 0, category: "Normal" };
  }
  const heightMeters = heightCm / 100;
  const bmiValue = weightKg / (heightMeters * heightMeters);
  const roundedBmi = Math.round(bmiValue * 10) / 10;

  let category: "Underweight" | "Normal" | "Overweight" | "Obese" = "Normal";
  if (roundedBmi < 18.5) {
    category = "Underweight";
  } else if (roundedBmi < 25.0) {
    category = "Normal";
  } else if (roundedBmi < 30.0) {
    category = "Overweight";
  } else {
    category = "Obese";
  }

  return { bmi: roundedBmi, category };
}
