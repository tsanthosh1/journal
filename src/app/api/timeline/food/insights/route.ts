import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser, unauthorizedResponse } from "@/lib/serverAuth";
import { getLifeEventsRange, getAiConfig } from "@/lib/timeline/storage";
import { resolveGeminiCandidateModels } from "@/lib/timeline/geminiModels";
import { LifeEvent, FoodPrimaryAnchor, FoodSourceType } from "@/lib/timeline/types";

export const dynamic = "force-dynamic";

interface FoodHabitMetrics {
  totalEvents: number;
  mainMealsCount: number;
  snacksCount: number;
  anchorsCount: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snacks: number;
  };
  sourcesCount: {
    homeCooked: number;
    onlineDelivery: number;
    hotelRestaurant: number;
    takeaway: number;
    other: number;
  };
  sourcesPercentage: {
    homeCooked: number;
    onlineDelivery: number;
    diningOut: number;
  };
  averageTimes: {
    breakfast: string | null;
    lunch: string | null;
    dinner: string | null;
  };
  lateDinnersCount: number; // Dinner after 21:00
  lateNightSnacksCount: number; // Snacks between 22:00 and 04:00
  topFoodItems: Array<{ name: string; count: number }>;
  uniqueDaysLogged: number;
  averageMealsPerDay: number;
}

export interface FoodHabitSuggestion {
  title: string;
  description: string;
  category: "Timing" | "Nutrition" | "Snacking" | "Dining Source";
  impact: "High" | "Medium" | "Low";
}

export interface FoodHabitInsightsResponse {
  timeframe: {
    startDate: string;
    endDate: string;
    daysCount: number;
  };
  metrics: FoodHabitMetrics;
  insights: {
    habitScore: number; // 0-100
    habitRating: "Excellent" | "Good" | "Fair" | "Needs Attention";
    summary: string;
    feedbackNarrative: string;
    strengths: string[];
    areasOfConcern: string[];
    suggestions: FoodHabitSuggestion[];
  };
  generatedAt: string;
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function minutesToTime(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  const meridiem = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${meridiem}`;
}

function calculateFoodMetrics(events: LifeEvent[], startDate: string, endDate: string): FoodHabitMetrics {
  const anchorsCount = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  const sourcesCount = {
    homeCooked: 0,
    onlineDelivery: 0,
    hotelRestaurant: 0,
    takeaway: 0,
    other: 0,
  };

  const breakfastTimes: number[] = [];
  const lunchTimes: number[] = [];
  const dinnerTimes: number[] = [];
  let lateDinnersCount = 0;
  let lateNightSnacksCount = 0;
  const itemFrequency: Record<string, number> = {};
  const uniqueDates = new Set<string>();

  for (const ev of events) {
    if (ev.date) uniqueDates.add(ev.date);

    const isSnack = ev.attributes?.occasionType === "Snack" || ev.attributes?.occasion?.includes("Snack");
    const anchor = (ev.attributes?.primaryAnchor as FoodPrimaryAnchor) || "Lunch";

    if (isSnack) {
      anchorsCount.snacks++;
    } else if (anchor === "Breakfast") {
      anchorsCount.breakfast++;
    } else if (anchor === "Lunch") {
      anchorsCount.lunch++;
    } else if (anchor === "Dinner") {
      anchorsCount.dinner++;
    }

    // Source count
    const source = (ev.attributes?.sourceType as FoodSourceType) || "Home Cooked";
    if (source === "Home Cooked") sourcesCount.homeCooked++;
    else if (source === "Online Delivery") sourcesCount.onlineDelivery++;
    else if (source === "Hotel / Restaurant") sourcesCount.hotelRestaurant++;
    else if (source === "Takeaway") sourcesCount.takeaway++;
    else sourcesCount.other++;

    // Timing analysis
    if (ev.startTime) {
      const mins = timeToMinutes(ev.startTime);
      const hour = Math.floor(mins / 60);

      if (anchor === "Breakfast" && !isSnack) {
        breakfastTimes.push(mins);
      } else if (anchor === "Lunch" && !isSnack) {
        lunchTimes.push(mins);
      } else if (anchor === "Dinner" && !isSnack) {
        dinnerTimes.push(mins);
        if (hour >= 21) lateDinnersCount++;
      }

      if (isSnack) {
        if (hour >= 22 || hour < 4) {
          lateNightSnacksCount++;
        }
      }
    }

    // Food items frequency
    const items = Array.isArray(ev.attributes?.foodItems) && ev.attributes.foodItems.length > 0
      ? ev.attributes.foodItems
      : [ev.title];

    for (const item of items) {
      const clean = item.trim();
      if (clean && clean.length > 1) {
        const key = clean.charAt(0).toUpperCase() + clean.slice(1);
        itemFrequency[key] = (itemFrequency[key] || 0) + 1;
      }
    }
  }

  const total = events.length;
  const sourcesPercentage = {
    homeCooked: total > 0 ? Math.round((sourcesCount.homeCooked / total) * 100) : 0,
    onlineDelivery: total > 0 ? Math.round((sourcesCount.onlineDelivery / total) * 100) : 0,
    diningOut: total > 0 ? Math.round(((sourcesCount.hotelRestaurant + sourcesCount.takeaway) / total) * 100) : 0,
  };

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const avgBreakfast = avg(breakfastTimes);
  const avgLunch = avg(lunchTimes);
  const avgDinner = avg(dinnerTimes);

  const topFoodItems = Object.entries(itemFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const uniqueDaysLogged = uniqueDates.size || 1;
  const averageMealsPerDay = parseFloat((total / uniqueDaysLogged).toFixed(1));

  return {
    totalEvents: total,
    mainMealsCount: anchorsCount.breakfast + anchorsCount.lunch + anchorsCount.dinner,
    snacksCount: anchorsCount.snacks,
    anchorsCount,
    sourcesCount,
    sourcesPercentage,
    averageTimes: {
      breakfast: avgBreakfast !== null ? minutesToTime(avgBreakfast) : null,
      lunch: avgLunch !== null ? minutesToTime(avgLunch) : null,
      dinner: avgDinner !== null ? minutesToTime(avgDinner) : null,
    },
    lateDinnersCount,
    lateNightSnacksCount,
    topFoodItems,
    uniqueDaysLogged,
    averageMealsPerDay,
  };
}

function generateRuleBasedInsights(metrics: FoodHabitMetrics): FoodHabitInsightsResponse["insights"] {
  let score = 75;
  const strengths: string[] = [];
  const areasOfConcern: string[] = [];
  const suggestions: FoodHabitSuggestion[] = [];

  // Home cooked score impact
  if (metrics.sourcesPercentage.homeCooked >= 70) {
    score += 15;
    strengths.push(`High reliance on home-cooked meals (${metrics.sourcesPercentage.homeCooked}% of all logs), which is great for nutritional consistency and digestion.`);
  } else if (metrics.sourcesPercentage.onlineDelivery >= 40) {
    score -= 10;
    areasOfConcern.push(`Online food delivery accounts for ${metrics.sourcesPercentage.onlineDelivery}% of your meals. Delivery foods tend to have higher sodium and hidden oils.`);
    suggestions.push({
      title: "Reduce Delivery Frequency",
      description: "Aim to limit Swiggy/Zomato orders to 1-2 times a week and substitute with simple home staples.",
      category: "Dining Source",
      impact: "High",
    });
  }

  // Late dinner impact
  if (metrics.lateDinnersCount > 2) {
    score -= 10;
    areasOfConcern.push(`You had ${metrics.lateDinnersCount} dinners logged after 9:00 PM. Late dinners can interfere with sleep quality and nighttime metabolic rest.`);
    suggestions.push({
      title: "Shift Dinner Window Earlier",
      description: "Aim to finish dinner before 8:30 PM to maintain a 2-3 hour buffer before sleeping.",
      category: "Timing",
      impact: "High",
    });
  } else if (metrics.averageTimes.dinner) {
    strengths.push(`Dinner timing averages ${metrics.averageTimes.dinner}, maintaining a steady eating schedule.`);
  }

  // Late night snacking
  if (metrics.lateNightSnacksCount > 1) {
    score -= 8;
    areasOfConcern.push(`Detected ${metrics.lateNightSnacksCount} late-night snacks past 10:00 PM.`);
    suggestions.push({
      title: "Curb Late-Night Cravings",
      description: "Replace post-10 PM snacks with a cup of warm water, chamomile tea, or a small glass of milk.",
      category: "Snacking",
      impact: "Medium",
    });
  }

  // Breakfast regularity
  if (metrics.anchorsCount.breakfast > 0 && metrics.uniqueDaysLogged > 0) {
    const breakfastRatio = metrics.anchorsCount.breakfast / metrics.uniqueDaysLogged;
    if (breakfastRatio >= 0.7) {
      strengths.push("Consistent morning breakfast habit to kickstart metabolic energy.");
    } else {
      suggestions.push({
        title: "Maintain Morning Fuel",
        description: "Include a light protein or fiber-rich breakfast consistently rather than skipping straight to lunch.",
        category: "Timing",
        impact: "Medium",
      });
    }
  }

  // Food variety suggestions
  if (metrics.topFoodItems.length > 0) {
    const topNames = metrics.topFoodItems.slice(0, 3).map((i) => i.name).join(", ");
    suggestions.push({
      title: "Diversify Micro-Nutrients",
      description: `Your most recurring items include ${topNames}. Add seasonal greens, raw salads, or sprouts to increase micronutrient density.`,
      category: "Nutrition",
      impact: "Medium",
    });
  }

  score = Math.max(40, Math.min(98, score));
  let rating: "Excellent" | "Good" | "Fair" | "Needs Attention" = "Good";
  if (score >= 85) rating = "Excellent";
  else if (score >= 70) rating = "Good";
  else if (score >= 55) rating = "Fair";
  else rating = "Needs Attention";

  const summary = `Overall habit rating is ${rating} (${score}/100). With ${metrics.sourcesPercentage.homeCooked}% home cooking and ${metrics.averageMealsPerDay} logs/day, your core eating routine has solid foundations with minor timing optimizations recommended.`;

  const feedbackNarrative = `Over the analyzed timeframe, you logged ${metrics.totalEvents} food entries across ${metrics.uniqueDaysLogged} days. Your meals consist of ${metrics.sourcesPercentage.homeCooked}% home-cooked food, ${metrics.sourcesPercentage.onlineDelivery}% online delivery, and ${metrics.sourcesPercentage.diningOut}% dining out/takeaway. Average lunch time is ${metrics.averageTimes.lunch || "midday"} and average dinner is ${metrics.averageTimes.dinner || "evening"}. ${lateDinnersCountMessage(metrics.lateDinnersCount, metrics.lateNightSnacksCount)}`;

  return {
    habitScore: score,
    habitRating: rating,
    summary,
    feedbackNarrative,
    strengths,
    areasOfConcern,
    suggestions,
  };
}

function lateDinnersCountMessage(lateDinners: number, lateSnacks: number): string {
  if (lateDinners > 0 && lateSnacks > 0) {
    return `You have ${lateDinners} late dinners and ${lateSnacks} late-night snacks logged; bringing these earlier will give you the most noticeable boost in energy and sleep.`;
  }
  if (lateDinners > 0) {
    return `Moving your ${lateDinners} late dinner sessions earlier will help optimize metabolic rest.`;
  }
  return "Your meal timings have been relatively steady and well-spaced.";
}

export async function POST(request: NextRequest) {
  const user = await getVerifiedUser(request);
  if (!user) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json().catch(() => ({}));
    const authUserId = user.email || user.primaryUserId || user.uid;
    const userId = (body.userId && body.userId !== "default_user") ? body.userId : authUserId;

    const lookbackDays = typeof body.lookbackDays === "number" && body.lookbackDays > 0 ? body.lookbackDays : 14;

    const endDt = new Date();
    const startDt = new Date();
    startDt.setDate(startDt.getDate() - lookbackDays);

    const formatIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const startDate = body.startDate || formatIso(startDt);
    const endDate = body.endDate || formatIso(endDt);

    // Fetch food events in the range
    const allEvents = await getLifeEventsRange(startDate, endDate, userId);
    const foodEvents = allEvents.filter((ev) => ev.activityType === "FOOD");

    const metrics = calculateFoodMetrics(foodEvents, startDate, endDate);
    let insights = generateRuleBasedInsights(metrics);

    // If AI configured, invoke Gemini for rich, personalized nutritionist analysis
    const aiConfig = await getAiConfig();
    if (aiConfig?.apiKey && (!aiConfig.provider || aiConfig.provider === "gemini") && foodEvents.length > 0) {
      const candidateModels = resolveGeminiCandidateModels(aiConfig.model);

      const recentMealsDigest = foodEvents.map((e) => ({
        date: e.date,
        time: e.startTime || "unspecified",
        title: e.title,
        anchor: e.attributes?.primaryAnchor,
        occasion: e.attributes?.occasion,
        type: e.attributes?.occasionType,
        source: e.attributes?.sourceType || "Home Cooked",
        sourceName: e.attributes?.sourceName,
        items: e.attributes?.foodItems || [e.title],
      }));

      const systemPrompt = `You are an expert clinical nutritionist and dietary habits analyst.
Analyze the user's logged meals and eating behavior from ${startDate} to ${endDate}.
Provide a constructive, highly personalized, empathetic review of their food habits with actionable suggestions.

Summary Metrics:
- Total food events logged: ${metrics.totalEvents} across ${metrics.uniqueDaysLogged} days
- Meal Breakdown: ${metrics.anchorsCount.breakfast} Breakfasts, ${metrics.anchorsCount.lunch} Lunches, ${metrics.anchorsCount.dinner} Dinners, ${metrics.anchorsCount.snacks} Snacks
- Dining Sources: ${metrics.sourcesPercentage.homeCooked}% Home Cooked, ${metrics.sourcesPercentage.onlineDelivery}% Delivery, ${metrics.sourcesPercentage.diningOut}% Dining Out
- Average Timings: Breakfast (${metrics.averageTimes.breakfast || "N/A"}), Lunch (${metrics.averageTimes.lunch || "N/A"}), Dinner (${metrics.averageTimes.dinner || "N/A"})
- Late Dinners (>9:00 PM): ${metrics.lateDinnersCount}
- Late Night Snacks (>10:00 PM): ${metrics.lateNightSnacksCount}
- Top Logged Items: ${metrics.topFoodItems.map((i) => `${i.name} (${i.count}x)`).join(", ")}

Chronological Meal History:
${JSON.stringify(recentMealsDigest, null, 2)}

Provide your response in strict JSON conforming to this schema:
{
  "habitScore": number (0 to 100, objective score reflecting regularity, home cooking, meal timing),
  "habitRating": "Excellent" | "Good" | "Fair" | "Needs Attention",
  "summary": "Crisp 1-2 sentence executive summary of habits and rating",
  "feedbackNarrative": "2-3 paragraphs of warm, insightful feedback covering: meal regularity, home cooking vs delivery patterns, late dinners/snacks, and overall nutritional rhythm.",
  "strengths": ["Clear positive habit 1", "Clear positive habit 2", "Clear positive habit 3"],
  "areasOfConcern": ["Actionable concern 1", "Actionable concern 2"],
  "suggestions": [
    {
      "title": "Short punchy recommendation title",
      "description": "Concrete 1-2 sentence actionable advice tailored to their specific logs",
      "category": "Timing" | "Nutrition" | "Snacking" | "Dining Source",
      "impact": "High" | "Medium" | "Low"
    }
  ]
}`;

      const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Please analyze my recent food habits, evaluate timing, home cooking vs delivery, late snacking, and generate personalized suggestions.",
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      };

      for (const model of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiConfig.apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const aiParsed = JSON.parse(text);
              if (typeof aiParsed.habitScore === "number" && Array.isArray(aiParsed.suggestions)) {
                insights = {
                  habitScore: Math.min(100, Math.max(20, aiParsed.habitScore)),
                  habitRating: aiParsed.habitRating || insights.habitRating,
                  summary: aiParsed.summary || insights.summary,
                  feedbackNarrative: aiParsed.feedbackNarrative || insights.feedbackNarrative,
                  strengths: Array.isArray(aiParsed.strengths) && aiParsed.strengths.length > 0 ? aiParsed.strengths : insights.strengths,
                  areasOfConcern: Array.isArray(aiParsed.areasOfConcern) ? aiParsed.areasOfConcern : insights.areasOfConcern,
                  suggestions: aiParsed.suggestions.length > 0 ? aiParsed.suggestions : insights.suggestions,
                };
                break;
              }
            }
          }
        } catch (err) {
          console.warn(`[food-insights] Gemini model ${model} failed, falling back...`, err);
        }
      }
    }

    const responseData: FoodHabitInsightsResponse = {
      timeframe: {
        startDate,
        endDate,
        daysCount: lookbackDays,
      },
      metrics,
      insights,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("[POST /api/timeline/food/insights] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate food habit insights" },
      { status: 500 }
    );
  }
}
