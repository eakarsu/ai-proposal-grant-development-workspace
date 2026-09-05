import Link from "next/link";
import { recordMetadata } from "@/lib/record-policy";
import DomainTools from "@/components/DomainTools";
import Connectors from "@/components/Connectors";
export default function Page() { return <div className="space-y-6">{["Simulation", "RecordedSimulation", "ExamSession", "Assignment"].some(e => recordMetadata[e]) ? <Link className="block font-semibold underline" href="/sessions">Open timed assignments, simulations and recording playback</Link> : null}<DomainTools/><Connectors/></div>; }
