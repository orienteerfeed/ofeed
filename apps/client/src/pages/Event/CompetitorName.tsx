interface Competitor {
  firstname: string;
  lastname: string;
}

interface CompetitorNameProps {
  competitor: Competitor;
}

export const getMobileCompetitorName = (competitor: Competitor): string => {
  const firstname = competitor.firstname?.trim() ?? '';
  const lastname = competitor.lastname?.trim() ?? '';

  return lastname.length > 0
    ? `${lastname} ${firstname.charAt(0)}.`
    : firstname;
};

export const CompetitorName = ({ competitor }: CompetitorNameProps) => {
  const firstname = competitor.firstname?.trim() ?? '';
  const lastname = competitor.lastname?.trim() ?? '';
  const hasLastname = lastname.length > 0;

  const fullName = hasLastname ? `${lastname} ${firstname}` : firstname;

  return (
    <>
      <span className="block truncate sm:hidden" title={fullName}>
        {getMobileCompetitorName(competitor)}
      </span>
      <span className="hidden truncate sm:block" title={fullName}>
        {fullName}
      </span>
    </>
  );
};
