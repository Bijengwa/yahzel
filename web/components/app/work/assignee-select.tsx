import { SelectField } from "@/components/ui/field";
import type { Member } from "@/lib/organisation";

/**
 * People eligible to receive Work: active members of the organisation, named
 * by whatever Yahzel actually knows them as. W0 assigns to a person only —
 * never a team or a department — so this stays a plain select of people.
 */
export function AssigneeSelect({
  id,
  label,
  members,
  value,
  error,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  members: Member[];
  value: string;
  error?: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const eligible = members.filter(
    (member) => member.status === "active" && member.profileId !== null,
  );

  return (
    <SelectField
      id={id}
      label={label}
      hint={hint}
      error={error}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Choose a person</option>

      {eligible.map((member) => (
        <option key={member.profileId} value={member.profileId ?? ""}>
          {member.fullName ?? member.email ?? `Member #${member.profileId}`}
        </option>
      ))}
    </SelectField>
  );
}
