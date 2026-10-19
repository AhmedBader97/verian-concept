import { AskSection } from "@/components/home/AskSection";
import { CareersTeaser } from "@/components/home/CareersTeaser";
import { ExpertiseIndex } from "@/components/home/ExpertiseIndex";
import { Featured } from "@/components/home/Featured";
import { Hero } from "@/components/home/Hero";
import { HomeField } from "@/components/home/HomeField";
import { LabTeaser } from "@/components/home/LabTeaser";
import { Latest } from "@/components/home/Latest";
import { Story } from "@/components/home/Story";
import { World } from "@/components/home/World";

export default function Home() {
  return (
    <>
      <HomeField>
        <Hero />
        <Story />
        <World />
      </HomeField>
      <ExpertiseIndex />
      <Featured />
      <AskSection />
      <LabTeaser />
      <Latest />
      <CareersTeaser />
    </>
  );
}
