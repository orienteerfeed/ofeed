interface Competitor {
  firstname: string;
  lastname: string;
}

interface CompetitorNameProps {
  competitor: Competitor;
}

export const CompetitorName = ({ competitor }: CompetitorNameProps) => {
  return (
    <>
      <span className="block sm:hidden">
        {competitor.lastname} {competitor.firstname.charAt(0)}.
      </span>
      <span className="hidden sm:block">
        {competitor.lastname} {competitor.firstname}
      </span>
    </>
  );
};
